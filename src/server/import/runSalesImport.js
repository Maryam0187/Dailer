import { Op } from "sequelize";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { syncLeadCustomer } from "@/server/customers/syncCustomer";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { IMPORT_TARGET_VALUES } from "@/lib/importSalesTargets";
import db from "@/server/db";

const SERVICE_TYPES = new Set(["dish", "direct", "cable", "streams"]);
const PROGRESS_TAGS = new Set(["verified", "processed", "sale_done"]);
const CONTACT_TAGS = new Set(["voicemail", "hangup", "no_response", "appointment"]);
const CHARGE_STATUSES = new Set(["charged", "declined", "chargeback"]);
const PHASES = new Set(["active", "closed", "cancelled"]);

function trimField(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

function parseBool(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return null;
}

function parseDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseAmount(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeToken(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitLegacyTokens(...rawValues) {
  const tokens = [];
  for (const raw of rawValues) {
    if (raw == null || raw === "") continue;
    const parts = String(raw)
      .split(/[,|/;+&]+/)
      .map((p) => normalizeToken(p))
      .filter(Boolean);
    tokens.push(...parts);
    const full = normalizeToken(raw);
    if (full && !parts.includes(full)) tokens.push(full);
  }
  return tokens;
}

/**
 * CSV status/tags → current workflow fields:
 *   contact:   no_response, voicemail, hangup, appointment
 *   card:      charged, declined, chargeback  → leadPaymentChargeStatus
 *   phase:     active, canceled/cancelled, closed
 *   progress:  verified, processed, sale_done
 */
function mapLegacyStatusAndTags({ statusRaw, tagsRaw, verifiedAt, leadAppointmentAt }) {
  const tokens = splitLegacyTokens(statusRaw, tagsRaw);

  const progress = new Set();
  let contactTag = leadAppointmentAt ? "appointment" : null;
  let chargeStatus = null;
  let leadPhase = null;

  for (const t of tokens) {
    // --- call outcome (contact) ---
    if (t === "no_response" || t.includes("no_response") || t.includes("noanswer") || t.includes("no_answer")) {
      contactTag = "no_response";
    } else if (t === "voicemail" || t.includes("voicemail") || t === "vm") {
      contactTag = "voicemail";
    } else if (t === "hangup" || t.includes("hangup") || t.includes("hang_up")) {
      contactTag = "hangup";
    } else if (t === "appointment" || t.includes("appointment") || t.includes("appt")) {
      contactTag = "appointment";
    }

    // --- admin card charge outcome ---
    if (t === "charged" || t === "charge") chargeStatus = "charged";
    if (t === "declined" || t === "decline") chargeStatus = "declined";
    if (t === "chargeback" || t === "charge_back") chargeStatus = "chargeback";

    // --- phase ---
    if (t === "active") leadPhase = "active";
    if (t === "canceled" || t === "cancelled" || t.includes("cancel")) leadPhase = "cancelled";
    if (t === "closed" || t === "sale_close") leadPhase = "closed";

    // --- progress tags ---
    if (t === "verified" || t.includes("verif")) progress.add("verified");
    if (t === "processed" || t.includes("process")) progress.add("processed");
    if (
      t === "sale_done" ||
      t === "saledone" ||
      t.includes("sale_done") ||
      t === "sold"
    ) {
      progress.add("sale_done");
    }
  }

  if (verifiedAt) progress.add("verified");

  // Defaults: sale_done implies closed phase; otherwise active if unset
  if (!leadPhase) {
    leadPhase = progress.has("sale_done") ? "closed" : "active";
  }

  const leadProgressTags = ["verified", "processed", "sale_done"].filter((t) => progress.has(t));

  return {
    status: "new", // legacy Lead.status — unused in UI workflow
    leadPhase: PHASES.has(leadPhase) ? leadPhase : "active",
    leadProgressTags,
    leadContactTag: contactTag && CONTACT_TAGS.has(contactTag) ? contactTag : null,
    leadPaymentChargeStatus:
      chargeStatus && CHARGE_STATUSES.has(chargeStatus) ? chargeStatus : null,
  };
}

function mapServiceType(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (SERVICE_TYPES.has(s)) return s;
  if (s.includes("dish")) return "dish";
  if (s.includes("direct")) return "direct";
  if (s.includes("stream")) return "streams";
  if (s.includes("cable")) return "cable";
  return null;
}

/** Resolve assigned supervisor for an agent (same rule as lead create). */
export async function resolveAssigneeForAgent(agentUserId) {
  const agent = await db.User.findByPk(agentUserId, {
    attributes: ["id", "supervisorId", "role", "shiftKey", "isActive"],
  });
  if (!agent || !agent.isActive) return null;

  let assignedUserId = agent.id;
  const supervisorId = agent.supervisorId;
  if (Number.isInteger(supervisorId) && supervisorId > 0) {
    const supervisor = await db.User.findOne({
      where: { id: supervisorId, role: "supervisor", isActive: true },
      attributes: ["id"],
    });
    if (supervisor) assignedUserId = supervisor.id;
  }
  return { agent, assignedUserId };
}

export async function listNightShiftAgents() {
  const users = await db.User.findAll({
    where: {
      isActive: true,
      shiftKey: "night",
      role: { [Op.in]: ["agent", "supervisor", "processor"] },
    },
    attributes: ["id", "username", "role", "shiftKey", "supervisorId"],
    order: [["username", "ASC"]],
  });

  const supervisorIds = [
    ...new Set(
      users
        .map((u) => Number(u.supervisorId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const supervisors =
    supervisorIds.length > 0
      ? await db.User.findAll({
          where: { id: { [Op.in]: supervisorIds }, role: "supervisor", isActive: true },
          attributes: ["id", "username"],
        })
      : [];
  const supervisorNameById = new Map(supervisors.map((s) => [s.id, s.username]));

  return users.map((u) => {
    const supervisorId = u.supervisorId ?? null;
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      shiftKey: u.shiftKey === "night" ? "night" : "day",
      supervisorId,
      supervisorUsername: supervisorId ? supervisorNameById.get(Number(supervisorId)) ?? null : null,
    };
  });
}

function cell(row, header) {
  if (!header) return "";
  const v = row[header];
  return v == null ? "" : String(v);
}

function findHeaderForTarget(columnMap, target) {
  return Object.entries(columnMap || {}).find(([, t]) => t === target)?.[0] ?? null;
}

/**
 * Build mapped lead fields + notes extras from one CSV row.
 */
function mapRowFields(row, columnMap) {
  const values = {};
  const noteParts = [];

  for (const [header, target] of Object.entries(columnMap || {})) {
    if (!IMPORT_TARGET_VALUES.has(target) || target === "skip") continue;
    const raw = cell(row, header).trim();
    if (!raw) continue;

    if (target === "append_notes") {
      noteParts.push(`${header}: ${raw}`);
      continue;
    }
    if (target === "agentId" || target === "agentEmail" || target === "agentName") {
      values[target] = raw;
      continue;
    }
    if (target === "tags") {
      values.tags = values.tags ? `${values.tags},${raw}` : raw;
      continue;
    }
    if (target === "notes") {
      noteParts.unshift(raw);
      continue;
    }
    values[target] = raw;
  }

  return { values, noteParts };
}

function buildFullName(values) {
  const direct = trimField(values.fullName, 128);
  if (direct) return direct;
  const first = trimField(values.firstName, 64) || "";
  const last = trimField(values.lastName, 64) || "";
  const combined = `${first} ${last}`.trim();
  return combined ? combined.slice(0, 128) : null;
}

/**
 * @param {object} opts
 * @param {Array<Record<string,string>>} opts.rows
 * @param {Record<string,string>} opts.columnMap
 * @param {Record<string,number>} opts.agentMap - file agent key → Users.id
 * @param {number} opts.adminUserId
 * @param {'agentId'|'agentEmail'|'agentName'|null} opts.agentKeyTarget
 */
export async function runSalesImport({
  rows,
  columnMap,
  agentMap = {},
  adminUserId,
  agentKeyTarget = null,
  fileName = null,
}) {
  const phoneHeader = findHeaderForTarget(columnMap, "phone");
  if (!phoneHeader) {
    return { ok: false, error: "Map at least one column to Phone", created: 0, skipped: 0, errors: [] };
  }

  const normalizedAgentMap = {};
  for (const [key, userId] of Object.entries(agentMap || {})) {
    const k = String(key).trim();
    const id = Number(userId);
    if (k && Number.isInteger(id) && id > 0) normalizedAgentMap[k] = id;
  }

  const hasAgentKey = Boolean(agentKeyTarget);
  const assigneeCache = new Map();

  const batch = await db.ImportBatch.create({
    createdByUserId: adminUserId,
    fileName: trimField(fileName, 255),
    createdCount: 0,
    skippedCount: 0,
  });

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 2; // header is row 1
    try {
      const { values, noteParts } = mapRowFields(row, columnMap);
      const phone = normalizeToE164(values.phone);
      if (!phone) {
        skipped += 1;
        errors.push({ row: rowNum, reason: "Invalid or missing phone" });
        continue;
      }

      const fullName = buildFullName(values) || "Unknown";
      // Always pending: admin owns until manual "Send to Leads" after review.
      const createdByUserId = adminUserId;
      const assignedUserId = adminUserId;
      let importOwnerUserId = null;

      if (hasAgentKey) {
        const agentKey = trimField(values[agentKeyTarget], 255);
        if (agentKey) {
          const mappedUserId = normalizedAgentMap[agentKey];
          if (mappedUserId) {
            let resolved = assigneeCache.get(mappedUserId);
            if (!resolved) {
              resolved = await resolveAssigneeForAgent(mappedUserId);
              if (resolved && resolved.agent.shiftKey === "night") {
                assigneeCache.set(mappedUserId, resolved);
              } else {
                resolved = null;
              }
            }
            if (resolved) importOwnerUserId = resolved.agent.id;
          }
        }
      }

      const serviceType = mapServiceType(values.serviceType);
      const verifiedAt = parseDate(values.verifiedAt);
      const leadAppointmentAt = parseDate(values.leadAppointmentAt);
      const createdAt = parseDate(values.createdAt);
      const leadProcessedRequired = parseBool(values.leadProcessedRequired) === true;
      const chargeAmount = parseAmount(values.leadPaymentChargeAmount);

      const mapped = mapLegacyStatusAndTags({
        statusRaw: values.status,
        tagsRaw: values.tags,
        verifiedAt,
        leadAppointmentAt,
      });

      const notesText = noteParts.length > 0 ? noteParts.join("\n") : null;

      const saleDoneAt = mapped.leadProgressTags.includes("sale_done")
        ? verifiedAt || createdAt || null
        : null;
      const processedAt = mapped.leadProgressTags.includes("processed")
        ? verifiedAt || createdAt || null
        : null;
      const resolvedVerifiedAt = mapped.leadProgressTags.includes("verified")
        ? verifiedAt || createdAt || null
        : verifiedAt;

      const leadPayload = {
        phone,
        fullName,
        cellNumber: values.cellNumber ? normalizeToE164(values.cellNumber) : null,
        company: trimField(values.company, 255),
        email: trimField(values.email, 255),
        city: trimField(values.city, 128),
        state: trimField(values.state, 32),
        zipCode: trimField(values.zipCode, 16),
        serviceType,
        cableName: serviceType === "cable" ? trimField(values.cableName, 128) : null,
        streamName: serviceType === "streams" ? trimField(values.streamName, 128) : null,
        breakdown: trimField(values.breakdown, 65535),
        notes: trimField(notesText, 65535),
        status: mapped.status,
        source: "legacy_import",
        assignedUserId,
        createdByUserId,
        importBatchId: batch.id,
        importOwnerUserId,
        leadProcessedRequired,
        leadPaymentChargeAmount: chargeAmount,
        verifiedAt: resolvedVerifiedAt,
        processedAt,
        saleDoneAt,
        leadAppointmentAt,
        leadProgressTags: mapped.leadProgressTags,
        leadContactTag: mapped.leadContactTag,
        leadPaymentChargeStatus: mapped.leadPaymentChargeStatus,
        leadPhase: mapped.leadPhase,
      };

      if (createdAt) {
        leadPayload.createdAt = createdAt;
        leadPayload.updatedAt = createdAt;
      }

      const lead = await db.Lead.create(leadPayload);
      await syncLeadCustomer(lead);
      await createLeadUpdate({
        leadId: lead.id,
        userId: adminUserId,
        type: "created",
        body: importOwnerUserId
          ? `Imported from legacy file (pending review; suggested owner #${importOwnerUserId})`
          : "Imported from legacy file (pending review — assign when sending to Leads)",
      });
      created += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ row: rowNum, reason: err?.message || "Import failed" });
    }
  }

  await batch.update({ createdCount: created, skippedCount: skipped });

  if (created === 0) {
    await batch.update({ revertedAt: new Date() });
  }

  return {
    ok: true,
    batchId: batch.id,
    created,
    skipped,
    errors: errors.slice(0, 100),
    errorCount: errors.length,
  };
}

export async function getLastRevertibleImportBatch() {
  const batch = await db.ImportBatch.findOne({
    where: { revertedAt: null, createdCount: { [Op.gt]: 0 } },
    order: [["id", "DESC"]],
    include: [{ model: db.User, as: "createdBy", attributes: ["id", "username"], required: false }],
  });
  if (!batch) return null;

  const remaining = await db.Lead.count({
    where: { importBatchId: batch.id, source: "legacy_import" },
  });

  return {
    id: batch.id,
    fileName: batch.fileName,
    createdCount: batch.createdCount,
    skippedCount: batch.skippedCount,
    remainingCount: remaining,
    createdAt: batch.createdAt,
    createdByUsername: batch.createdBy?.username ?? null,
  };
}

/**
 * Delete all leads from the latest non-reverted import batch.
 * Customers are kept. Call log leadId refs are cleared.
 */
export async function revertLastImportBatch({ adminUserId }) {
  const batch = await db.ImportBatch.findOne({
    where: { revertedAt: null, createdCount: { [Op.gt]: 0 } },
    order: [["id", "DESC"]],
  });
  if (!batch) {
    return { ok: false, error: "No import batch to revert", status: 404 };
  }

  const leads = await db.Lead.findAll({
    where: { importBatchId: batch.id },
    attributes: ["id"],
  });
  const leadIds = leads.map((l) => l.id);

  const transaction = await db.sequelize.transaction();
  try {
    if (leadIds.length > 0) {
      await db.LeadUpdate.destroy({ where: { leadId: { [Op.in]: leadIds } }, transaction });
      await db.CallLog.update(
        { leadId: null },
        { where: { leadId: { [Op.in]: leadIds } }, transaction },
      );
      await db.Lead.destroy({ where: { id: { [Op.in]: leadIds } }, transaction });
    }
    await batch.update({ revertedAt: new Date() }, { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    return { ok: false, error: err?.message || "Revert failed", status: 500 };
  }

  return {
    ok: true,
    batchId: batch.id,
    deletedCount: leadIds.length,
    fileName: batch.fileName,
    revertedByUserId: adminUserId,
  };
}

/**
 * Admin later-assign: createdBy = agent, assigned = agent's supervisor.
 */
export async function assignLegacyLeadToAgent({ leadId, agentUserId, adminUserId }) {
  const lead = await db.Lead.findByPk(leadId);
  if (!lead) return { ok: false, error: "Lead not found", status: 404 };
  if (lead.source !== "legacy_import") {
    return { ok: false, error: "Only legacy_import leads can be assigned this way", status: 400 };
  }

  const resolved = await resolveAssigneeForAgent(agentUserId);
  if (!resolved) return { ok: false, error: "Invalid agent", status: 400 };
  if (resolved.agent.shiftKey !== "night") {
    return { ok: false, error: "Choose a night-shift user", status: 400 };
  }

  const previousCreatedBy = lead.createdByUserId;
  const previousAssigned = lead.assignedUserId;

  await lead.update({
    createdByUserId: resolved.agent.id,
    assignedUserId: resolved.assignedUserId,
    importOwnerUserId: null,
  });

  await createLeadUpdate({
    leadId: lead.id,
    userId: adminUserId,
    type: "assigned",
    body: `Sent to Leads: belongs to user #${resolved.agent.id}, assigned → user #${resolved.assignedUserId}`,
  });

  return {
    ok: true,
    leadId: lead.id,
    createdByUserId: resolved.agent.id,
    assignedUserId: resolved.assignedUserId,
    previousCreatedByUserId: previousCreatedBy,
    previousAssignedUserId: previousAssigned,
  };
}

/** Delete one imported lead (customers kept). */
export async function deleteLegacyImportLead({ leadId }) {
  const lead = await db.Lead.findByPk(leadId);
  if (!lead) return { ok: false, error: "Lead not found", status: 404 };
  if (lead.source !== "legacy_import") {
    return { ok: false, error: "Only legacy_import leads can be deleted here", status: 400 };
  }

  const transaction = await db.sequelize.transaction();
  try {
    await db.LeadUpdate.destroy({ where: { leadId: lead.id }, transaction });
    await db.CallLog.update({ leadId: null }, { where: { leadId: lead.id }, transaction });
    await lead.destroy({ transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    return { ok: false, error: err?.message || "Delete failed", status: 500 };
  }

  return { ok: true, leadId };
}

export async function listLegacyImportLeads({ scope = "pending", limit = 100 } = {}) {
  const adminUsers = await db.User.findAll({
    where: { role: "admin" },
    attributes: ["id"],
    raw: true,
  });
  const adminIds = adminUsers.map((u) => u.id);

  const where = { source: "legacy_import" };
  if (scope === "pending") {
    if (adminIds.length === 0) return { leads: [], pendingCount: 0, assignedCount: 0 };
    where.createdByUserId = { [Op.in]: adminIds };
  } else if (scope === "assigned") {
    if (adminIds.length === 0) {
      // all legacy imports count as assigned if no admins
    } else {
      where.createdByUserId = { [Op.notIn]: adminIds };
    }
  }

  const baseAttributes = [
    "id",
    "phone",
    "fullName",
    "status",
    "leadPhase",
    "notes",
    "createdAt",
    "createdByUserId",
    "assignedUserId",
  ];
  const baseIncludes = [
    { model: db.User, as: "createdBy", attributes: ["id", "username", "role"], required: false },
    { model: db.User, as: "assignedUser", attributes: ["id", "username", "role"], required: false },
  ];

  const limitN = Math.min(Math.max(Number(limit) || 100, 1), 300);

  let leads;
  try {
    leads = await db.Lead.findAll({
      where,
      order: [["id", "DESC"]],
      limit: limitN,
      attributes: [...baseAttributes, "importOwnerUserId"],
      include: [
        ...baseIncludes,
        { model: db.User, as: "importOwner", attributes: ["id", "username", "role"], required: false },
      ],
    });
  } catch (err) {
    // Migration not applied yet, or association missing after hot reload.
    console.warn("[listLegacyImportLeads] fallback without importOwner:", err?.message || err);
    leads = await db.Lead.findAll({
      where,
      order: [["id", "DESC"]],
      limit: limitN,
      attributes: baseAttributes,
      include: baseIncludes,
    });
  }

  const [pendingCount, assignedCount] = await Promise.all([
    adminIds.length
      ? db.Lead.count({
          where: { source: "legacy_import", createdByUserId: { [Op.in]: adminIds } },
        })
      : 0,
    adminIds.length
      ? db.Lead.count({
          where: { source: "legacy_import", createdByUserId: { [Op.notIn]: adminIds } },
        })
      : db.Lead.count({ where: { source: "legacy_import" } }),
  ]);

  return {
    pendingCount,
    assignedCount,
    leads: leads.map((l) => ({
      id: l.id,
      phone: l.phone,
      fullName: l.fullName,
      status: l.status,
      leadPhase: l.leadPhase,
      notesPreview: l.notes ? String(l.notes).slice(0, 120) : null,
      createdAt: l.createdAt,
      createdByUserId: l.createdByUserId,
      createdByUsername: l.createdBy?.username ?? null,
      createdByRole: l.createdBy?.role ?? null,
      assignedUserId: l.assignedUserId,
      assignedUsername: l.assignedUser?.username ?? null,
      importOwnerUserId: l.importOwnerUserId ?? null,
      importOwnerUsername: l.importOwner?.username ?? null,
      pending: adminIds.includes(l.createdByUserId),
    })),
  };
}

/** @deprecated use listLegacyImportLeads({ scope: 'pending' }) */
export async function listUnassignedLegacyLeads({ limit = 50 } = {}) {
  const result = await listLegacyImportLeads({ scope: "pending", limit });
  return result.leads;
}
