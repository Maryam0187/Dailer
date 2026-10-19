import { QueryTypes } from "sequelize";
import db from "@/server/db";
import { REPORT_TIMEZONE, zonedDayStart } from "@/lib/calendarDayBounds";
import {
  backfillAllCallDailyMetrics,
  getCallDailyMetricsCoverage,
} from "@/server/calls/callDailyMetrics";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BATCH_SIZE = 5000;
const MAX_BATCHES = 2000;

export const RETENTION_TARGETS = {
  callLogs: { key: "callLogs", tableName: "CallLogs", label: "Call logs" },
  userActivities: {
    key: "userActivities",
    tableName: "UserActivities",
    label: "User activities",
  },
};

const ALLOWED_TARGET_KEYS = new Set(Object.keys(RETENTION_TARGETS));

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {unknown} value
 * @returns {string|null} YYYY-MM-DD
 */
export function normalizeBeforeDate(value) {
  const raw = String(value || "").trim();
  if (!DATE_ONLY_RE.test(raw)) return null;
  return raw;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, targets: string[] } | { ok: false, error: string }}
 */
export function normalizeTargets(raw) {
  let list = raw;
  if (typeof list === "string") {
    list = list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, error: "targets is required (callLogs and/or userActivities)" };
  }
  const targets = [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
  if (targets.length === 0) {
    return { ok: false, error: "targets is required (callLogs and/or userActivities)" };
  }
  for (const t of targets) {
    if (!ALLOWED_TARGET_KEYS.has(t)) {
      return { ok: false, error: `Unknown target: ${t}` };
    }
  }
  return { ok: true, targets };
}

/**
 * Resolve cutoff: start of beforeDate in Asia/Karachi (UTC Date).
 * Rejects future calendar dates in that timezone.
 */
export function resolveCutoff(beforeDate) {
  const dateOnly = normalizeBeforeDate(beforeDate);
  if (!dateOnly) {
    return { error: "beforeDate is required (YYYY-MM-DD)" };
  }
  const cutoff = zonedDayStart(dateOnly, REPORT_TIMEZONE);
  if (!cutoff) {
    return { error: "Invalid beforeDate" };
  }
  const todayStart = zonedDayStart(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: REPORT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    REPORT_TIMEZONE,
  );
  if (todayStart && cutoff.getTime() > todayStart.getTime()) {
    return { error: "beforeDate cannot be in the future" };
  }
  return { beforeDate: dateOnly, cutoff, timezone: REPORT_TIMEZONE };
}

async function countOlderThan(tableName, cutoff) {
  const rows = await db.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM \`${tableName}\` WHERE createdAt < :cutoff`,
    {
      replacements: { cutoff },
      type: QueryTypes.SELECT,
    },
  );
  return toNum(rows[0]?.cnt);
}

export async function previewDataRetention({ beforeDate, targets }) {
  const resolved = resolveCutoff(beforeDate);
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.status = 400;
    throw err;
  }
  const targetNorm = normalizeTargets(targets);
  if (!targetNorm.ok) {
    const err = new Error(targetNorm.error);
    err.status = 400;
    throw err;
  }

  const counts = {};
  let total = 0;
  for (const key of targetNorm.targets) {
    const meta = RETENTION_TARGETS[key];
    const count = await countOlderThan(meta.tableName, resolved.cutoff);
    counts[key] = count;
    total += count;
  }

  const callDaily = await getCallDailyMetricsCoverage();

  return {
    beforeDate: resolved.beforeDate,
    cutoff: resolved.cutoff.toISOString(),
    timezone: resolved.timezone,
    targets: targetNorm.targets,
    counts,
    total,
    callDaily,
    notes: [
      "Deletes are permanent.",
      "Call reports keep working from CallDailyMetrics (date-wise). Run backfill before purging call logs.",
      "Attendance day status stays in AttendanceDailyRecords; only login drill-down is removed with UserActivities.",
      "InviteDialLegs cascade with CallLogs. Lead/bill FKs to call logs become NULL.",
    ],
  };
}

function affectedRowsFromQuery(result) {
  if (result == null) return 0;
  if (Array.isArray(result)) {
    const meta = result[1] ?? result[0];
    return toNum(meta?.affectedRows);
  }
  return toNum(result?.affectedRows);
}

async function deleteOlderThanBatched(tableName, cutoff) {
  let deleted = 0;
  let batches = 0;
  while (batches < MAX_BATCHES) {
    const result = await db.sequelize.query(
      `DELETE FROM \`${tableName}\` WHERE createdAt < :cutoff LIMIT :batchSize`,
      {
        replacements: { cutoff, batchSize: BATCH_SIZE },
      },
    );
    const affected = affectedRowsFromQuery(result);
    deleted += affected;
    batches += 1;
    if (affected < BATCH_SIZE) break;
  }
  return { deleted, batches };
}

export async function purgeDataRetention({ beforeDate, targets, confirm }) {
  if (String(confirm || "").trim() !== "DELETE") {
    const err = new Error('confirm must be the string "DELETE"');
    err.status = 400;
    throw err;
  }

  const resolved = resolveCutoff(beforeDate);
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.status = 400;
    throw err;
  }
  const targetNorm = normalizeTargets(targets);
  if (!targetNorm.ok) {
    const err = new Error(targetNorm.error);
    err.status = 400;
    throw err;
  }

  let backfill = null;
  if (targetNorm.targets.includes("callLogs")) {
    // Ensure date-wise report rollups are current before removing raw CallLogs.
    backfill = await backfillAllCallDailyMetrics();
  }

  const deleted = {};
  let totalDeleted = 0;
  for (const key of targetNorm.targets) {
    const meta = RETENTION_TARGETS[key];
    const result = await deleteOlderThanBatched(meta.tableName, resolved.cutoff);
    deleted[key] = result.deleted;
    totalDeleted += result.deleted;
  }

  return {
    beforeDate: resolved.beforeDate,
    cutoff: resolved.cutoff.toISOString(),
    timezone: resolved.timezone,
    targets: targetNorm.targets,
    deleted,
    totalDeleted,
    backfill,
  };
}

async function tableSize(tableName) {
  const rows = await db.sequelize.query(
    `SELECT
       TABLE_NAME AS tableName,
       TABLE_ROWS AS tableRows,
       DATA_LENGTH AS dataLength,
       INDEX_LENGTH AS indexLength,
       (DATA_LENGTH + INDEX_LENGTH) AS totalLength
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName`,
    {
      replacements: { tableName },
      type: QueryTypes.SELECT,
    },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    tableName: row.tableName,
    tableRows: toNum(row.tableRows),
    dataLength: toNum(row.dataLength),
    indexLength: toNum(row.indexLength),
    totalLength: toNum(row.totalLength),
  };
}

export async function optimizeRetentionTables({ targets }) {
  const targetNorm = normalizeTargets(targets);
  if (!targetNorm.ok) {
    const err = new Error(targetNorm.error);
    err.status = 400;
    throw err;
  }

  const results = [];
  for (const key of targetNorm.targets) {
    const meta = RETENTION_TARGETS[key];
    const before = await tableSize(meta.tableName);
    await db.sequelize.query(`OPTIMIZE TABLE \`${meta.tableName}\``);
    const after = await tableSize(meta.tableName);
    results.push({
      target: key,
      tableName: meta.tableName,
      before,
      after,
    });
  }

  return { results };
}

export { backfillAllCallDailyMetrics, getCallDailyMetricsCoverage };
