import db from "@/server/db";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";
import { buildLeadsListWhere, getLeadStatsCreators } from "@/server/leads/leadAccess";

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

export async function aggregateLeadMetrics({ authedUser, fromDate, toDate }) {
  const accessWhere = await buildLeadsListWhere(authedUser);
  const leads = await db.Lead.findAll({
    where: {
      ...accessWhere,
      ...dateRangeWhere(fromDate, toDate),
    },
    attributes: ["id", "createdByUserId", "status"],
  });

  const creators = await getLeadStatsCreators(authedUser);
  const creatorBuckets = new Map();
  for (const user of creators) {
    creatorBuckets.set(user.id, emptyStatusCounts());
  }

  for (const lead of leads) {
    const creatorId = lead.createdByUserId;
    if (creatorId && creatorBuckets.has(creatorId)) {
      addLeadToCounts(creatorBuckets.get(creatorId), lead.status);
    }
  }

  const agents = creators.map((user) =>
    mapCountsRow(
      { userId: user.id, username: user.username, role: user.role },
      creatorBuckets.get(user.id) || emptyStatusCounts(),
    ),
  );

  return {
    agents,
    agentTotals: sumTotals(agents),
  };
}
