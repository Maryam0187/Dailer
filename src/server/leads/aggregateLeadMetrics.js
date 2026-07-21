import db from "@/server/db";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";
import {
  andWhereClause,
  resolveLeadsListWhere,
  getFilterSupervisors,
  getLeadStatsCreators,
  leadsCreatedByShiftWhere,
} from "@/server/leads/leadAccess";

const STATUS_KEYS = ["new", "contacted", "callback", "qualified", "closed", "dnc"];

function emptyStatusCounts() {
  return {
    total: 0,
    closed: 0,
    dnc: 0,
    new: 0,
    contacted: 0,
    callback: 0,
    qualified: 0,
    inProgress: 0,
  };
}

function addLeadToCounts(counts, status) {
  counts.total += 1;
  const key = String(status || "").toLowerCase();
  if (STATUS_KEYS.includes(key)) {
    counts[key] += 1;
  }
  if (key !== "closed" && key !== "dnc") {
    counts.inProgress += 1;
  }
}

function mapCountsRow(base, counts) {
  return {
    ...base,
    total: counts.total,
    closed: counts.closed,
    dnc: counts.dnc,
    new: counts.new,
    contacted: counts.contacted,
    callback: counts.callback,
    qualified: counts.qualified,
    inProgress: counts.inProgress,
  };
}

function sumTotals(rows) {
  const totals = emptyStatusCounts();
  for (const row of rows) {
    totals.total += row.total;
    totals.closed += row.closed;
    totals.dnc += row.dnc;
    totals.new += row.new;
    totals.contacted += row.contacted;
    totals.callback += row.callback;
    totals.qualified += row.qualified;
    totals.inProgress += row.inProgress;
  }
  return totals;
}

function normalizeUserId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
    attributes: ["id", "assignedUserId", "createdByUserId", "status"],
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
          attributes: ["id", "role"],
          raw: true,
        })
      : [];
  const creatorRoles = new Map(creatorRoleRows.map((r) => [r.id, r.role]));

  for (const lead of leads) {
    const creatorId = normalizeUserId(lead.createdByUserId);
    const assignedId = normalizeUserId(lead.assignedUserId);

    if (creatorId && creatorBuckets.has(creatorId)) {
      addLeadToCounts(creatorBuckets.get(creatorId), lead.status);
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
      addLeadToCounts(supervisorBuckets.get(assignedId), lead.status);
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

  return {
    agents,
    agentTotals: sumTotals(agents),
    supervisors: supervisorAssignments,
    supervisorTotals: sumTotals(supervisorAssignments),
  };
}
