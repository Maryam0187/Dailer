import { Op, Sequelize } from "sequelize";
import db from "@/server/db";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { formatLeadService } from "@/lib/leadService";
import {
  isLeadSupervisor,
} from "@/lib/leadRoles";
import {
  canAccessLead,
  excludeOutsideSaleWhere,
  andWhereClause,
  getSupervisedAgentUserIds,
  getLeadSupervisorTeamAgentIds,
} from "@/server/leads/leadAccess";

function progressTagContainsLiteral(tag) {
  return Sequelize.literal(
    `JSON_CONTAINS(\`leadProgressTags\`, ${db.sequelize.escape(JSON.stringify(tag))})`,
  );
}

/** Phone/cell digit variants for matching linked sales. */
export function linkedLeadPhoneMatchOr(phone, cellNumber) {
  const values = [phone, cellNumber].map((v) => String(v || "").trim()).filter(Boolean);
  const or = [];
  const seen = new Set();

  function pushClause(field, value) {
    const key = `${field}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    or.push({ [field]: value });
  }

  for (const raw of values) {
    pushClause("phone", raw);
    pushClause("cellNumber", raw);
    const digits = raw.replace(/\D/g, "");
    if (!digits) continue;
    pushClause("phone", digits);
    pushClause("cellNumber", digits);
    if (digits.length >= 7) {
      const last7 = digits.slice(-7);
      or.push({ phone: { [Op.like]: `%${last7}` } });
      or.push({ cellNumber: { [Op.like]: `%${last7}` } });
    }
    const e164 = normalizeToE164(digits);
    if (e164) {
      pushClause("phone", e164);
      pushClause("cellNumber", e164);
    }
  }
  return or;
}

function saleStatusLabel(leadPhase) {
  if (leadPhase === "closed") return "Sale completed";
  if (leadPhase === "cancelled") return "Cancelled";
  return "Active";
}

function chargeStatusLabel(chargeStatus) {
  if (chargeStatus === "charged") return "Done";
  if (chargeStatus === "chargeback") return "Chargeback";
  return "Pending";
}

/**
 * Limited linked-sale summary. Charge Done/Pending/Chargeback is visible to all roles.
 * Agent/supervisor names are role-gated.
 */
export function serializeLinkedLeadSummary(lead, { canOpen, showAgent, showSupervisor }) {
  const phase = lead.leadPhase || "active";
  return {
    id: lead.id,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    saleDoneAt: lead.saleDoneAt || null,
    serviceLabel: formatLeadService(lead),
    serviceType: lead.serviceType || null,
    leadPhase: phase,
    saleStatusLabel: saleStatusLabel(phase),
    leadCancelReason: phase === "cancelled" ? lead.leadCancelReason || null : null,
    chargeStatus: lead.leadPaymentChargeStatus || null,
    chargeStatusLabel: chargeStatusLabel(lead.leadPaymentChargeStatus),
    createdByUsername: showAgent ? lead.createdBy?.username ?? null : null,
    supervisorUsername: showSupervisor
      ? lead.createdBy?.supervisor?.username ?? null
      : null,
    canOpen: Boolean(canOpen),
  };
}

async function resolveTeamCreatorIds(authedUser) {
  const role = authedUser.role;
  if (role === "supervisor") {
    return getSupervisedAgentUserIds(authedUser.id);
  }
  if (isLeadSupervisor(role)) {
    return getLeadSupervisorTeamAgentIds(authedUser);
  }
  return null;
}

function nameVisibilityFor(authedUser, creatorId, teamCreatorIds) {
  if (authedUser.role === "admin") {
    return { showAgent: true, showSupervisor: true };
  }
  if (!Number.isInteger(creatorId) || creatorId <= 0) {
    return { showAgent: false, showSupervisor: false };
  }
  if (teamCreatorIds) {
    return {
      showAgent: teamCreatorIds.includes(creatorId) || creatorId === Number(authedUser.id),
      showSupervisor: false,
    };
  }
  return { showAgent: false, showSupervisor: false };
}

const linkedLeadInclude = [
  {
    model: db.User,
    as: "createdBy",
    attributes: ["id", "username", "role", "supervisorId"],
    required: false,
    include: [
      {
        model: db.User,
        as: "supervisor",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  },
];

/**
 * Other sale-done leads on the same phone/cell as `lead`.
 */
export async function findLinkedLeadsForLead(lead, authedUser) {
  const matchOr = linkedLeadPhoneMatchOr(lead.phone, lead.cellNumber);
  if (matchOr.length === 0) return [];

  let where = {
    id: { [Op.ne]: lead.id },
    [Op.or]: matchOr,
    [Op.and]: [progressTagContainsLiteral("sale_done")],
  };
  where = andWhereClause(where, excludeOutsideSaleWhere());

  const rows = await db.Lead.findAll({
    where,
    attributes: [
      "id",
      "phone",
      "cellNumber",
      "serviceType",
      "cableName",
      "streamName",
      "leadPhase",
      "leadCancelReason",
      "leadPaymentChargeStatus",
      "saleDoneAt",
      "createdByUserId",
      "assignedUserId",
      "processorUserId",
      "sharedViewerUserId",
      "createdAt",
      "updatedAt",
    ],
    include: linkedLeadInclude,
    order: [
      ["saleDoneAt", "DESC"],
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: 50,
  });

  const teamCreatorIds = await resolveTeamCreatorIds(authedUser);
  const out = [];
  for (const row of rows) {
    const canOpen = await canAccessLead(row, authedUser);
    const creatorId = Number(row.createdByUserId);
    const { showAgent, showSupervisor } = nameVisibilityFor(authedUser, creatorId, teamCreatorIds);
    out.push(serializeLinkedLeadSummary(row, { canOpen, showAgent, showSupervisor }));
  }
  return out;
}
