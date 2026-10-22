import { QueryTypes } from "sequelize";
import db from "@/server/db";
import { REPORT_TIMEZONE, calendarDateRangeBounds } from "@/lib/calendarDayBounds";

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Calendar YYYY-MM-DD for a UTC instant in the app report timezone (US Eastern). */
export function callCalendarDate(at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at instanceof Date ? at : new Date(at));
}

const AGG_SELECT = `
  COUNT(*) AS total,
  SUM(CASE WHEN LOWER(cl.status) = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN LOWER(cl.status) = 'no-answer' THEN 1 ELSE 0 END) AS noAnswer,
  SUM(CASE WHEN LOWER(cl.status) IN ('failed','canceled','cancelled') THEN 1 ELSE 0 END) AS failedOrCanceled,
  SUM(CASE WHEN LOWER(cl.status) = 'busy' THEN 1 ELSE 0 END) AS busy,
  COALESCE(SUM(cl.durationSeconds), 0) AS durationSeconds,
  SUM(CASE WHEN idl.callLogId IS NOT NULL THEN 1 ELSE 0 END) AS confTotal,
  SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) = 'completed' THEN 1 ELSE 0 END) AS confCompleted,
  SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) = 'no-answer' THEN 1 ELSE 0 END) AS confNoAnswer,
  SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) IN ('failed','canceled','cancelled') THEN 1 ELSE 0 END) AS confFailedOrCanceled,
  SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) = 'busy' THEN 1 ELSE 0 END) AS confBusy,
  COALESCE(SUM(CASE WHEN idl.callLogId IS NOT NULL THEN cl.durationSeconds ELSE 0 END), 0) AS confDurationSeconds
`;

function mapAggRow(row) {
  return {
    total: toInt(row?.total),
    completed: toInt(row?.completed),
    noAnswer: toInt(row?.noAnswer),
    failedOrCanceled: toInt(row?.failedOrCanceled),
    busy: toInt(row?.busy),
    durationSeconds: toInt(row?.durationSeconds),
    confTotal: toInt(row?.confTotal),
    confCompleted: toInt(row?.confCompleted),
    confNoAnswer: toInt(row?.confNoAnswer),
    confFailedOrCanceled: toInt(row?.confFailedOrCanceled),
    confBusy: toInt(row?.confBusy),
    confDurationSeconds: toInt(row?.confDurationSeconds),
  };
}

/**
 * Recompute one user's day from live CallLogs and upsert CallDailyMetrics.
 * Safe to call after status/duration updates while raw logs still exist.
 */
export async function rebuildCallDailyMetricsForUserDate(userId, calendarDate) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(calendarDate || ""))) return null;

  const bounds = calendarDateRangeBounds(calendarDate, calendarDate);
  if (!bounds) return null;

  const rows = await db.sequelize.query(
    `SELECT ${AGG_SELECT}
     FROM CallLogs cl
     LEFT JOIN (
       SELECT DISTINCT callLogId FROM InviteDialLegs
     ) idl ON idl.callLogId = cl.id
     WHERE cl.userId = :userId
       AND cl.createdAt >= :after
       AND cl.createdAt < :before`,
    {
      replacements: { userId: uid, after: bounds.after, before: bounds.before },
      type: QueryTypes.SELECT,
    },
  );

  const totals = mapAggRow(rows[0]);
  if (totals.total === 0) {
    await db.CallDailyMetric.destroy({
      where: { userId: uid, calendarDate },
    });
    return null;
  }

  const [row] = await db.CallDailyMetric.upsert({
    userId: uid,
    calendarDate,
    ...totals,
  });
  return row;
}

/** After a CallLog write — refresh that call's calendar day rollup. */
export async function refreshCallDailyMetricsForCall(call) {
  const userId = Number(call?.userId);
  if (!Number.isInteger(userId) || userId < 1) return;
  const createdAt = call?.createdAt || new Date();
  const calendarDate = callCalendarDate(createdAt);
  try {
    await rebuildCallDailyMetricsForUserDate(userId, calendarDate);
  } catch (err) {
    console.error("[callDailyMetrics] refresh failed", err?.message || err);
  }
}

/**
 * Full backfill from CallLogs into CallDailyMetrics (replace all rows).
 * Uses US Eastern day boundaries (REPORT_TIMEZONE).
 */
export async function backfillAllCallDailyMetrics() {
  const transaction = await db.sequelize.transaction();
  try {
    await db.sequelize.query("DELETE FROM CallDailyMetrics", { transaction });

    await db.sequelize.query(
      `INSERT INTO CallDailyMetrics (
         userId, calendarDate,
         total, completed, noAnswer, failedOrCanceled, busy, durationSeconds,
         confTotal, confCompleted, confNoAnswer, confFailedOrCanceled, confBusy, confDurationSeconds,
         createdAt, updatedAt
       )
       SELECT
         cl.userId,
         DATE(CONVERT_TZ(cl.createdAt, '+00:00', '+05:00')) AS calendarDate,
         COUNT(*) AS total,
         SUM(CASE WHEN LOWER(cl.status) = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN LOWER(cl.status) = 'no-answer' THEN 1 ELSE 0 END) AS noAnswer,
         SUM(CASE WHEN LOWER(cl.status) IN ('failed','canceled','cancelled') THEN 1 ELSE 0 END) AS failedOrCanceled,
         SUM(CASE WHEN LOWER(cl.status) = 'busy' THEN 1 ELSE 0 END) AS busy,
         COALESCE(SUM(cl.durationSeconds), 0) AS durationSeconds,
         SUM(CASE WHEN idl.callLogId IS NOT NULL THEN 1 ELSE 0 END) AS confTotal,
         SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) = 'completed' THEN 1 ELSE 0 END) AS confCompleted,
         SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) = 'no-answer' THEN 1 ELSE 0 END) AS confNoAnswer,
         SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) IN ('failed','canceled','cancelled') THEN 1 ELSE 0 END) AS confFailedOrCanceled,
         SUM(CASE WHEN idl.callLogId IS NOT NULL AND LOWER(cl.status) = 'busy' THEN 1 ELSE 0 END) AS confBusy,
         COALESCE(SUM(CASE WHEN idl.callLogId IS NOT NULL THEN cl.durationSeconds ELSE 0 END), 0) AS confDurationSeconds,
         UTC_TIMESTAMP(),
         UTC_TIMESTAMP()
       FROM CallLogs cl
       LEFT JOIN (
         SELECT DISTINCT callLogId FROM InviteDialLegs
       ) idl ON idl.callLogId = cl.id
       GROUP BY cl.userId, DATE(CONVERT_TZ(cl.createdAt, '+00:00', '+05:00'))`,
      { transaction },
    );

    const [{ cnt }] = await db.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM CallDailyMetrics`,
      { type: QueryTypes.SELECT, transaction },
    );

    await transaction.commit();
    return { rows: toInt(cnt), timezone: REPORT_TIMEZONE };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getCallDailyMetricsCoverage() {
  const [rowCount] = await db.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM CallDailyMetrics`,
    { type: QueryTypes.SELECT },
  );
  const [range] = await db.sequelize.query(
    `SELECT MIN(calendarDate) AS minDate, MAX(calendarDate) AS maxDate FROM CallDailyMetrics`,
    { type: QueryTypes.SELECT },
  );
  const [callCount] = await db.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM CallLogs`,
    { type: QueryTypes.SELECT },
  );
  return {
    dailyRows: toInt(rowCount?.cnt),
    minDate: range?.minDate || null,
    maxDate: range?.maxDate || null,
    callLogRows: toInt(callCount?.cnt),
    ready: toInt(rowCount?.cnt) > 0 || toInt(callCount?.cnt) === 0,
  };
}

export function pickMetricColumns(row, conferenceOnly) {
  if (conferenceOnly) {
    return {
      total: toInt(row?.confTotal),
      completed: toInt(row?.confCompleted),
      noAnswer: toInt(row?.confNoAnswer),
      failedOrCanceled: toInt(row?.confFailedOrCanceled),
      busy: toInt(row?.confBusy),
      durationSeconds: toInt(row?.confDurationSeconds),
    };
  }
  return {
    total: toInt(row?.total),
    completed: toInt(row?.completed),
    noAnswer: toInt(row?.noAnswer),
    failedOrCanceled: toInt(row?.failedOrCanceled),
    busy: toInt(row?.busy),
    durationSeconds: toInt(row?.durationSeconds),
  };
}
