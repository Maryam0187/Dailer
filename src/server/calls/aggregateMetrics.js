import { Op, QueryTypes } from "sequelize";
import db from "@/server/db";

/**
 * Distinct CallLog ids that have invite legs.
 * When fromDate/toDate are set, only include legs whose CallLog.createdAt is in range
 * (avoids scanning all historical InviteDialLegs for dated reports).
 */
export async function conferenceCallIds({ fromDate, toDate } = {}) {
  if (fromDate && toDate) {
    const after = new Date(`${fromDate}T00:00:00.000Z`);
    const before = new Date(`${toDate}T23:59:59.999Z`);
    const rows = await db.sequelize.query(
      `SELECT DISTINCT idl.callLogId AS callLogId
       FROM InviteDialLegs AS idl
       INNER JOIN CallLogs AS cl ON cl.id = idl.callLogId
       WHERE cl.createdAt BETWEEN :after AND :before`,
      {
        replacements: { after, before },
        type: QueryTypes.SELECT,
      },
    );
    return rows
      .map((r) => Number(r.callLogId))
      .filter((id) => Number.isInteger(id));
  }

  const confRows = await db.InviteDialLeg.findAll({
    attributes: ["callLogId"],
    group: ["callLogId"],
    raw: true,
  });
  return confRows.map((r) => r.callLogId).filter((id) => Number.isInteger(id));
}

/** CallLog ids where the given user was an invited agent (optionally date-scoped via CallLog). */
export async function invitedConferenceCallIds(userId, { fromDate, toDate } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id)) return [];

  if (fromDate && toDate) {
    const after = new Date(`${fromDate}T00:00:00.000Z`);
    const before = new Date(`${toDate}T23:59:59.999Z`);
    const rows = await db.sequelize.query(
      `SELECT DISTINCT idl.callLogId AS callLogId
       FROM InviteDialLegs AS idl
       INNER JOIN CallLogs AS cl ON cl.id = idl.callLogId
       WHERE idl.invitedUserId = :userId
         AND cl.createdAt BETWEEN :after AND :before`,
      {
        replacements: { userId: id, after, before },
        type: QueryTypes.SELECT,
      },
    );
    return rows
      .map((r) => Number(r.callLogId))
      .filter((cid) => Number.isInteger(cid));
  }

  const invitedRows = await db.InviteDialLeg.findAll({
    where: { invitedUserId: id },
    attributes: ["callLogId"],
    group: ["callLogId"],
    raw: true,
  });
  return invitedRows.map((r) => r.callLogId).filter((cid) => Number.isInteger(cid));
}

export function dateRangeWhere(fromDate, toDate) {
  return dateRangeWhereOn("createdAt", fromDate, toDate);
}

export function dateRangeWhereOn(field, fromDate, toDate) {
  const after = new Date(`${fromDate}T00:00:00.000Z`);
  const before = new Date(`${toDate}T23:59:59.999Z`);
  return { [field]: { [Op.between]: [after, before] } };
}

const NON_ADMIN_USER_WHERE = { role: { [Op.ne]: "admin" } };

function isAdminRole(role) {
  return String(role || "").trim().toLowerCase() === "admin";
}

function filterOutAdminMetrics(metrics) {
  return metrics.filter((m) => !isAdminRole(m.role));
}

export async function aggregateCallMetrics(where) {
  const { fn, col, literal } = db.sequelize;
  const statusSum = (status) =>
    fn("SUM", literal(`CASE WHEN LOWER(status) = '${status}' THEN 1 ELSE 0 END`));
  const statusSumIn = (statuses) => {
    const list = statuses.map((s) => `'${s}'`).join(", ");
    return fn("SUM", literal(`CASE WHEN LOWER(status) IN (${list}) THEN 1 ELSE 0 END`));
  };

  const row = await db.CallLog.findOne({
    attributes: [
      [fn("COUNT", col("id")), "total"],
      [statusSum("completed"), "completed"],
      [statusSum("no-answer"), "noAnswer"],
      [statusSumIn(["failed", "canceled", "cancelled"]), "failedOrCanceled"],
      [statusSum("busy"), "busy"],
      [fn("SUM", col("durationSeconds")), "durationSeconds"],
    ],
    where,
    raw: true,
  });

  return mapMetricsRow(row);
}

export async function aggregateMetricsByUser({
  fromDate,
  toDate,
  conferenceOnly,
  includeAllUsers = false,
  excludeAdmin = false,
}) {
  const where = {
    ...dateRangeWhere(fromDate, toDate),
  };

  if (conferenceOnly) {
    const ids = await conferenceCallIds({ fromDate, toDate });
    if (ids.length === 0) {
      if (!includeAllUsers) {
        return { metrics: [], totals: emptyTotals() };
      }
      const allUsers = await db.User.findAll({
        attributes: ["id", "username", "role"],
        where: excludeAdmin ? NON_ADMIN_USER_WHERE : undefined,
        order: [["username", "ASC"]],
        raw: true,
      });
      let metrics = allUsers.map((u) => ({
        userId: u.id,
        username: u.username,
        role: u.role,
        ...emptyTotals(),
      }));
      if (excludeAdmin) metrics = filterOutAdminMetrics(metrics);
      return { metrics, totals: emptyTotals() };
    }
    where.id = { [Op.in]: ids };
  }

  const { fn, col, literal } = db.sequelize;
  const statusSum = (status) =>
    fn("SUM", literal(`CASE WHEN LOWER(status) = '${status}' THEN 1 ELSE 0 END`));
  const statusSumIn = (statuses) => {
    const list = statuses.map((s) => `'${s}'`).join(", ");
    return fn("SUM", literal(`CASE WHEN LOWER(status) IN (${list}) THEN 1 ELSE 0 END`));
  };

  const aggregated = await db.CallLog.findAll({
    attributes: [
      "userId",
      [fn("COUNT", col("id")), "total"],
      [statusSum("completed"), "completed"],
      [statusSum("no-answer"), "noAnswer"],
      [statusSumIn(["failed", "canceled", "cancelled"]), "failedOrCanceled"],
      [statusSum("busy"), "busy"],
      [fn("SUM", col("durationSeconds")), "durationSeconds"],
    ],
    where,
    group: ["userId"],
    raw: true,
  });

  const userIds = aggregated.map((r) => r.userId).filter((id) => Number.isInteger(id));
  const users =
    userIds.length > 0
      ? await db.User.findAll({
          where: { id: userIds },
          attributes: ["id", "username", "role"],
          raw: true,
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const metricsByUserId = new Map(
    aggregated
      .map((row) => {
        const u = userById.get(row.userId);
        if (excludeAdmin && isAdminRole(u?.role)) return null;
        return [
          row.userId,
          {
            userId: row.userId,
            username: u?.username || "—",
            role: u?.role || null,
            ...mapMetricsRow(row),
          },
        ];
      })
      .filter(Boolean),
  );

  let metrics;
  if (includeAllUsers) {
    const allUsers = await db.User.findAll({
      attributes: ["id", "username", "role"],
      where: excludeAdmin ? NON_ADMIN_USER_WHERE : undefined,
      order: [["username", "ASC"]],
      raw: true,
    });
    metrics = allUsers.map((u) => {
      const existing = metricsByUserId.get(u.id);
      if (existing) return existing;
      return {
        userId: u.id,
        username: u.username,
        role: u.role,
        ...emptyTotals(),
      };
    });
    metrics.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return (a.username || "").localeCompare(b.username || "");
    });
  } else {
    metrics = [...metricsByUserId.values()].sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return (a.username || "").localeCompare(b.username || "");
    });
  }

  if (excludeAdmin) {
    metrics = filterOutAdminMetrics(metrics);
  }

  const totals = metrics.reduce(
    (acc, m) => ({
      total: acc.total + m.total,
      completed: acc.completed + m.completed,
      noAnswer: acc.noAnswer + m.noAnswer,
      failedOrCanceled: acc.failedOrCanceled + m.failedOrCanceled,
      busy: acc.busy + m.busy,
      durationSeconds: acc.durationSeconds + m.durationSeconds,
    }),
    emptyTotals(),
  );

  return { metrics, totals };
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function mapMetricsRow(row) {
  return {
    total: toInt(row?.total),
    completed: toInt(row?.completed),
    noAnswer: toInt(row?.noAnswer),
    failedOrCanceled: toInt(row?.failedOrCanceled),
    busy: toInt(row?.busy),
    durationSeconds: toInt(row?.durationSeconds),
  };
}

export function emptyTotals() {
  return {
    total: 0,
    completed: 0,
    noAnswer: 0,
    failedOrCanceled: 0,
    busy: 0,
    durationSeconds: 0,
  };
}
