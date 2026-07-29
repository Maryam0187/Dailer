import db from "@/server/db";
import { Op } from "sequelize";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";
import {
  andWhereClause,
  resolveLeadsListWhere,
  getFilterSupervisors,
  getLeadStatsCreators,
  leadsCreatedByShiftWhere,
} from "@/server/leads/leadAccess";
import { LEAD_PHASES, LEAD_PROGRESS_TAGS, parseLeadProgressTags } from "@/lib/leadWorkflow";

const PHASE_KEYS = LEAD_PHASES.map((p) => p.value);
const PROGRESS_KEYS = LEAD_PROGRESS_TAGS.map((t) => t.value);

function emptyStatusCounts() {
  const counts = {
    total: 0,
    active: 0,
    closed: 0,
    cancelled: 0,
  };
  for (const key of PROGRESS_KEYS) counts[key] = 0;
  return counts;
}

function emptyProcessorCounts() {
  return {
    assigned: 0,
    processed: 0,
    pending: 0,
  };
}

function leadHasProcessed(lead) {
  const progress = parseLeadProgressTags(lead.leadProgressTags) || [];
  return progress.includes("processed");
}

function addLeadToCounts(counts, lead) {
  counts.total += 1;

  const phase = String(lead.leadPhase || "active").toLowerCase();
  if (PHASE_KEYS.includes(phase)) counts[phase] += 1;
  else counts.active += 1;

  const progress = parseLeadProgressTags(lead.leadProgressTags) || [];
  for (const tag of progress) {
    if (PROGRESS_KEYS.includes(tag)) counts[tag] += 1;
  }
}

function addProcessorLeadToCounts(counts, lead) {
  counts.assigned += 1;
  if (leadHasProcessed(lead)) counts.processed += 1;
  else counts.pending += 1;
}

function mapCountsRow(base, counts) {
  return {
    ...base,
    ...counts,
  };
}

function sumTotals(rows, emptyFn) {
  const totals = emptyFn();
  for (const row of rows) {
    for (const key of Object.keys(totals)) {
      totals[key] += Number(row[key]) || 0;
    }
  }
  return totals;
}

function normalizeUserId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeShiftKey(value) {
  const s = String(value || "").trim().toLowerCase();
  return s === "day" || s === "night" ? s : null;
}

function userMatchesShift(user, shiftKey) {
  if (!shiftKey) return true;
  const key = user?.shiftKey === "night" ? "night" : "day";
  return key === shiftKey;
}

async function getLeadStatsProcessors(shiftKey = null) {
  const users = await db.User.findAll({
    where: { role: "processor", isActive: true },
    attributes: ["id", "username", "shiftKey"],
    order: [["username", "ASC"]],
  });
  const key = normalizeShiftKey(shiftKey);
  if (!key) return users;
  return users.filter((u) => userMatchesShift(u, key));
}

export async function aggregateLeadMetrics({ authedUser, fromDate, toDate, shiftKey = null }) {
  let accessWhere = await resolveLeadsListWhere(authedUser);
  const shiftWhere = await leadsCreatedByShiftWhere(shiftKey);
  if (shiftWhere) accessWhere = andWhereClause(accessWhere, shiftWhere);

  const leads = await db.Lead.findAll({
    where: {
      ...accessWhere,
      ...dateRangeWhere(fromDate, toDate),
    },
    attributes: [
      "id",
      "assignedUserId",
      "createdByUserId",
      "processorUserId",
      "leadPhase",
      "leadProgressTags",
    ],
  });

  const creators = await getLeadStatsCreators(authedUser);
  const creatorBuckets = new Map();
  for (const user of creators) {
    creatorBuckets.set(user.id, emptyStatusCounts());
  }

  const supervisors = await getFilterSupervisors(authedUser);
  const supervisorBuckets = new Map();
  for (const sup of supervisors) {
    supervisorBuckets.set(sup.id, emptyStatusCounts());
  }

  const processors = await getLeadStatsProcessors(shiftKey);
  const processorBuckets = new Map();
  for (const user of processors) {
    processorBuckets.set(user.id, emptyProcessorCounts());
  }

  const agentRows = await db.User.findAll({
    where: { role: "agent", isActive: true },
    attributes: ["id", "supervisorId"],
    raw: true,
  });
  const agentIds = new Set(agentRows.map((a) => a.id));
  const agentSupervisorMap = new Map(
    agentRows.filter((a) => a.supervisorId).map((a) => [a.id, a.supervisorId]),
  );

  const creatorIds = [
    ...new Set(leads.map((l) => normalizeUserId(l.createdByUserId)).filter(Boolean)),
  ];
  const creatorRoleRows =
    creatorIds.length > 0
      ? await db.User.findAll({
          where: { id: creatorIds },
          attributes: ["id", "role", "username"],
          raw: true,
        })
      : [];
  const creatorRoles = new Map(creatorRoleRows.map((r) => [r.id, r.role]));
  const creatorNames = new Map(creatorRoleRows.map((r) => [r.id, r.username]));

  /** @type {Map<string, { agentUserId: number, processorUserId: number, assigned: number, processed: number, pending: number }>} */
  const agentProcessorBuckets = new Map();

  // Include processors that have assignments but aren't in the shift-filtered list
  // (e.g. cross-shift assignment) so counts aren't dropped silently.
  const orphanProcessorIds = [
    ...new Set(
      leads
        .map((l) => normalizeUserId(l.processorUserId))
        .filter((id) => id && !processorBuckets.has(id)),
    ),
  ];
  if (orphanProcessorIds.length > 0) {
    const orphanRows = await db.User.findAll({
      where: { id: { [Op.in]: orphanProcessorIds }, role: "processor" },
      attributes: ["id", "username", "shiftKey"],
      raw: true,
    });
    for (const user of orphanRows) {
      processorBuckets.set(user.id, emptyProcessorCounts());
      processors.push(user);
    }
  }

  for (const lead of leads) {
    const creatorId = normalizeUserId(lead.createdByUserId);
    const assignedId = normalizeUserId(lead.assignedUserId);
    const processorId = normalizeUserId(lead.processorUserId);

    if (creatorId && creatorBuckets.has(creatorId)) {
      addLeadToCounts(creatorBuckets.get(creatorId), lead);
    }

    // Team inbox: agent-created leads assigned to their supervisor (not supervisor's own leads).
    if (
      creatorId &&
      assignedId &&
      creatorRoles.get(creatorId) === "agent" &&
      agentIds.has(creatorId) &&
      supervisorBuckets.has(assignedId) &&
      agentSupervisorMap.get(creatorId) === assignedId
    ) {
      addLeadToCounts(supervisorBuckets.get(assignedId), lead);
    }

    if (processorId && processorBuckets.has(processorId)) {
      addProcessorLeadToCounts(processorBuckets.get(processorId), lead);

      if (creatorId) {
        const pairKey = `${creatorId}:${processorId}`;
        let pair = agentProcessorBuckets.get(pairKey);
        if (!pair) {
          pair = {
            agentUserId: creatorId,
            processorUserId: processorId,
            assigned: 0,
            processed: 0,
            pending: 0,
          };
          agentProcessorBuckets.set(pairKey, pair);
        }
        addProcessorLeadToCounts(pair, lead);
      }
    }
  }

  const agents = creators.map((user) =>
    mapCountsRow(
      { userId: user.id, username: user.username, role: user.role },
      creatorBuckets.get(user.id) || emptyStatusCounts(),
    ),
  );

  const supervisorAssignments = supervisors.map((sup) =>
    mapCountsRow(
      { userId: sup.id, username: sup.username },
      supervisorBuckets.get(sup.id) || emptyStatusCounts(),
    ),
  );

  const processorNameById = new Map(processors.map((p) => [p.id, p.username]));

  const processorRows = processors
    .map((user) =>
      mapCountsRow(
        { userId: user.id, username: user.username },
        processorBuckets.get(user.id) || emptyProcessorCounts(),
      ),
    )
    .sort((a, b) => b.assigned - a.assigned || a.username.localeCompare(b.username));

  const missingAgentIds = [
    ...new Set(
      [...agentProcessorBuckets.values()]
        .map((r) => r.agentUserId)
        .filter((id) => !creatorNames.has(id)),
    ),
  ];
  if (missingAgentIds.length > 0) {
    const missingAgents = await db.User.findAll({
      where: { id: { [Op.in]: missingAgentIds } },
      attributes: ["id", "username", "role"],
      raw: true,
    });
    for (const u of missingAgents) {
      creatorNames.set(u.id, u.username);
      creatorRoles.set(u.id, u.role);
    }
  }

  const agentProcessorRows = [...agentProcessorBuckets.values()]
    .map((row) => ({
      agentUserId: row.agentUserId,
      agentUsername: creatorNames.get(row.agentUserId) || `user #${row.agentUserId}`,
      agentRole: creatorRoles.get(row.agentUserId) || null,
      processorUserId: row.processorUserId,
      processorUsername: processorNameById.get(row.processorUserId) || `user #${row.processorUserId}`,
      assigned: row.assigned,
      processed: row.processed,
      pending: row.pending,
    }))
    .sort(
      (a, b) =>
        a.agentUsername.localeCompare(b.agentUsername) ||
        a.processorUsername.localeCompare(b.processorUsername),
    );

  return {
    agents,
    agentTotals: sumTotals(agents, emptyStatusCounts),
    supervisors: supervisorAssignments,
    supervisorTotals: sumTotals(supervisorAssignments, emptyStatusCounts),
    processors: processorRows,
    processorTotals: sumTotals(processorRows, emptyProcessorCounts),
    agentProcessors: agentProcessorRows,
    agentProcessorTotals: sumTotals(agentProcessorRows, emptyProcessorCounts),
  };
}
