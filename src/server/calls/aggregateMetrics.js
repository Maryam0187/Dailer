import { Op, QueryTypes } from "sequelize";
import db from "@/server/db";
import { calendarDateRangeBounds } from "@/lib/calendarDayBounds";
import { pickMetricColumns } from "@/server/calls/callDailyMetrics";

/**
 * Distinct CallLog ids that have invite legs.
 * When fromDate/toDate are set, only include legs whose CallLog.createdAt is in range
 * (avoids scanning all historical InviteDialLegs for dated reports).
 */
export async function conferenceCallIds({ fromDate, toDate } = {}) {
  if (fromDate && toDate) {
    const bounds = calendarDateRangeBounds(fromDate, toDate);
    if (!bounds) return [];
    const { after, before } = bounds;
    const rows = await db.sequelize.query(
      `SELECT DISTINCT idl.callLogId AS callLogId
       FROM InviteDialLegs AS idl
       INNER JOIN CallLogs AS cl ON cl.id = idl.callLogId
       WHERE cl.createdAt >= :after AND cl.createdAt < :before`,
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
    const bounds = calendarDateRangeBounds(fromDate, toDate);
    if (!bounds) return [];
    const { after, before } = bounds;
    const rows = await db.sequelize.query(
      `SELECT DISTINCT idl.callLogId AS callLogId
       FROM InviteDialLegs AS idl
       INNER JOIN CallLogs AS cl ON cl.id = idl.callLogId
       WHERE idl.invitedUserId = :userId
         AND cl.createdAt >= :after AND cl.createdAt < :before`,
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

/** Filter a datetime field by inclusive calendar days in the app timezone (US Eastern). */
export function dateRangeWhereOn(field, fromDate, toDate) {
  const bounds = calendarDateRangeBounds(fromDate, toDate);
  if (!bounds) return {};
  return { [field]: { [Op.gte]: bounds.after, [Op.lt]: bounds.before } };
}

const NON_ADMIN_USER_WHERE = { role: { [Op.ne]: "admin" } };
const USER_METRIC_ATTRIBUTES = ["id", "username", "role", "shiftKey", "isOutside"];

function isAdminRole(role) {
  return String(role || "").trim().toLowerCase() === "admin";
}

function filterOutAdminMetrics(metrics) {
  return metrics.filter((m) => !isAdminRole(m.role));
}

/**
 * @param {{ excludeAdmin?: boolean, locationFilter?: string, shiftKey?: string|null }} opts
 */
function userListWhere({ excludeAdmin = false, locationFilter = "all", shiftKey = null } = {}) {
  const parts = [];
  if (excludeAdmin) parts.push(NON_ADMIN_USER_WHERE);
  if (locationFilter === "outside") parts.push({ isOutside: true });
  if (locationFilter === "in_house") parts.push({ isOutside: { [Op.ne]: true } });
  if (shiftKey === "day" || shiftKey === "night") {
    parts.push({ shiftKey: shiftKey === "night" ? "night" : "day" });
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return { [Op.and]: parts };
}

function serializeUserMetrics(u, totals) {
  return {
    userId: u.id,
    username: u.username,
    role: u.role,
    shiftKey: u.shiftKey === "night" ? "night" : "day",
    isOutside: Boolean(u.isOutside),
    ...totals,
  };
}

function sumMetricTotals(metrics) {
  return metrics.reduce(
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
}

/** Live CallLogs aggregate (fallback when daily table empty / no date range). */
export async function aggregateCallMetricsFromLogs(where) {
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

export async function aggregateCallMetrics(where) {
  return aggregateCallMetricsFromLogs(where);
}

/** Sum CallDailyMetrics for one user over inclusive calendar dates. */
export async function aggregateCallMetricsFromDaily({
  userId,
  fromDate,
  toDate,
  conferenceOnly = false,
}) {
  const { fn, col } = db.sequelize;
  const prefix = conferenceOnly ? "conf" : "";
  const colName = (base) => {
    if (!prefix) return base;
    if (base === "total") return "confTotal";
    if (base === "completed") return "confCompleted";
    if (base === "noAnswer") return "confNoAnswer";
    if (base === "failedOrCanceled") return "confFailedOrCanceled";
    if (base === "busy") return "confBusy";
    if (base === "durationSeconds") return "confDurationSeconds";
    return base;
  };

  const row = await db.CallDailyMetric.findOne({
    attributes: [
      [fn("SUM", col(colName("total"))), "total"],
      [fn("SUM", col(colName("completed"))), "completed"],
      [fn("SUM", col(colName("noAnswer"))), "noAnswer"],
      [fn("SUM", col(colName("failedOrCanceled"))), "failedOrCanceled"],
      [fn("SUM", col(colName("busy"))), "busy"],
      [fn("SUM", col(colName("durationSeconds"))), "durationSeconds"],
    ],
    where: {
      userId,
      calendarDate: { [Op.gte]: fromDate, [Op.lte]: toDate },
    },
    raw: true,
  });

  const providerDuration = await durationSecondsByVoiceProvider({
    userId,
    fromDate,
    toDate,
    conferenceOnly,
  });

  return { ...mapMetricsRow(row), ...providerDuration };
}

/** Twilio vs Zoom talk time from CallLogs for one user over inclusive calendar days. */
async function durationSecondsByVoiceProvider({
  userId,
  fromDate,
  toDate,
  conferenceOnly = false,
}) {
  const empty = { twilioDurationSeconds: 0, zoomDurationSeconds: 0 };
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return empty;

  const bounds = calendarDateRangeBounds(fromDate, toDate);
  if (!bounds) return empty;

  const conferenceJoin = conferenceOnly
    ? `INNER JOIN (SELECT DISTINCT callLogId FROM InviteDialLegs) idl ON idl.callLogId = cl.id`
    : "";

  const rows = await db.sequelize.query(
    `SELECT
       COALESCE(SUM(CASE
         WHEN LOWER(COALESCE(cl.voiceProvider, 'twilio')) = 'zoom' THEN cl.durationSeconds
         ELSE 0
       END), 0) AS zoomDurationSeconds,
       COALESCE(SUM(CASE
         WHEN LOWER(COALESCE(cl.voiceProvider, 'twilio')) = 'zoom' THEN 0
         ELSE cl.durationSeconds
       END), 0) AS twilioDurationSeconds
     FROM CallLogs cl
     ${conferenceJoin}
     WHERE cl.userId = :userId
       AND cl.createdAt >= :after
       AND cl.createdAt < :before`,
    {
      replacements: { userId: id, after: bounds.after, before: bounds.before },
      type: QueryTypes.SELECT,
    },
  );

  return {
    twilioDurationSeconds: toInt(rows[0]?.twilioDurationSeconds),
    zoomDurationSeconds: toInt(rows[0]?.zoomDurationSeconds),
  };
}

export async function aggregateMetricsByUser({
  fromDate,
  toDate,
  conferenceOnly,
  includeAllUsers = false,
  excludeAdmin = false,
  locationFilter = "all",
  shiftKey = null,
}) {
  const usersWhere = userListWhere({ excludeAdmin, locationFilter, shiftKey });

  const { fn, col } = db.sequelize;
  const aggregated = await db.CallDailyMetric.findAll({
    attributes: [
      "userId",
      [fn("SUM", col("total")), "total"],
      [fn("SUM", col("completed")), "completed"],
      [fn("SUM", col("noAnswer")), "noAnswer"],
      [fn("SUM", col("failedOrCanceled")), "failedOrCanceled"],
      [fn("SUM", col("busy")), "busy"],
      [fn("SUM", col("durationSeconds")), "durationSeconds"],
      [fn("SUM", col("confTotal")), "confTotal"],
      [fn("SUM", col("confCompleted")), "confCompleted"],
      [fn("SUM", col("confNoAnswer")), "confNoAnswer"],
      [fn("SUM", col("confFailedOrCanceled")), "confFailedOrCanceled"],
      [fn("SUM", col("confBusy")), "confBusy"],
      [fn("SUM", col("confDurationSeconds")), "confDurationSeconds"],
    ],
    where: {
      calendarDate: { [Op.gte]: fromDate, [Op.lte]: toDate },
    },
    group: ["userId"],
    raw: true,
  });

  const userIds = aggregated.map((r) => r.userId).filter((id) => Number.isInteger(id));
  const users =
    userIds.length > 0
      ? await db.User.findAll({
          where: usersWhere ? { id: userIds, ...usersWhere } : { id: userIds },
          attributes: USER_METRIC_ATTRIBUTES,
          raw: true,
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const metricsByUserId = new Map(
    aggregated
      .map((row) => {
        const u = userById.get(row.userId);
        if (!u) return null;
        if (excludeAdmin && isAdminRole(u.role)) return null;
        return [
          row.userId,
          serializeUserMetrics(u, pickMetricColumns(row, conferenceOnly)),
        ];
      })
      .filter(Boolean),
  );

  let metrics;
  if (includeAllUsers) {
    const allUsers = await db.User.findAll({
      attributes: USER_METRIC_ATTRIBUTES,
      where: usersWhere,
      order: [["username", "ASC"]],
      raw: true,
    });
    metrics = allUsers.map((u) => {
      const existing = metricsByUserId.get(u.id);
      if (existing) return existing;
      return serializeUserMetrics(u, emptyTotals());
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

  return { metrics, totals: sumMetricTotals(metrics) };
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
