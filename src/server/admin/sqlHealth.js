import { QueryTypes } from "sequelize";
import db from "@/server/db";

const STATUS_KEYS = [
  "Uptime",
  "Threads_connected",
  "Threads_running",
  "Aborted_clients",
  "Aborted_connects",
  "Questions",
  "Queries",
  "Slow_queries",
  "Com_select",
  "Com_insert",
  "Com_update",
  "Com_delete",
  "Select_scan",
  "Select_full_join",
  "Select_range",
  "Sort_merge_passes",
  "Created_tmp_disk_tables",
  "Created_tmp_tables",
  "Innodb_buffer_pool_reads",
  "Innodb_buffer_pool_read_requests",
  "Innodb_buffer_pool_pages_total",
  "Innodb_buffer_pool_pages_data",
  "Innodb_buffer_pool_pages_free",
  "Innodb_buffer_pool_pages_dirty",
  "Innodb_data_reads",
  "Innodb_data_writes",
  "Innodb_row_lock_waits",
  "Innodb_row_lock_time",
  "Innodb_rows_read",
  "Innodb_rows_inserted",
  "Innodb_rows_updated",
  "Innodb_rows_deleted",
  "Bytes_received",
  "Bytes_sent",
  "Max_used_connections",
];

const VARIABLE_KEYS = [
  "version",
  "max_connections",
  "innodb_buffer_pool_size",
  "long_query_time",
];

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowsToMap(rows) {
  const map = {};
  for (const row of rows) {
    const name = row.Variable_name ?? row.variable_name;
    const value = row.Value ?? row.value;
    if (name != null) map[name] = value;
  }
  return map;
}

async function showMap(kind, names) {
  const sql =
    kind === "status"
      ? "SHOW GLOBAL STATUS WHERE Variable_name IN (:names)"
      : "SHOW GLOBAL VARIABLES WHERE Variable_name IN (:names)";
  const rows = await db.sequelize.query(sql, {
    replacements: { names },
    type: QueryTypes.SELECT,
  });
  return rowsToMap(rows);
}

function ratio(numerator, denominator) {
  const d = toNum(denominator);
  if (d <= 0) return null;
  return toNum(numerator) / d;
}

function buildHints({ efficiency, connections, locks, innodb }) {
  const hints = [];

  if (efficiency.tableScanRatio != null && efficiency.tableScanRatio >= 0.2) {
    hints.push({
      severity: "warn",
      title: "High table-scan ratio",
      detail:
        "Many SELECTs are scanning whole tables. Prefer indexes on filter/sort columns (e.g. CallLogs.createdAt, Leads.createdAt) and date ranges on list/report APIs.",
    });
  }

  if (toNum(efficiency.fullJoins) >= 100) {
    hints.push({
      severity: "warn",
      title: "Full joins accumulating",
      detail:
        "Joins without usable indexes show up as Select_full_join. Check list/report joins on CallLogs, Leads, and InviteDialLegs.",
    });
  }

  if (toNum(connections.abortedClients) + toNum(connections.abortedConnects) >= 100) {
    hints.push({
      severity: "info",
      title: "Aborted connections",
      detail:
        "Clients or the proxy may be closing MySQL connections early. Prefer a stable pool and Railway private networking when the app runs on Railway.",
    });
  }

  if (toNum(locks.rowLockWaits) >= 1000) {
    hints.push({
      severity: "info",
      title: "Row lock waits",
      detail:
        "Frequent UPDATEs on the same call rows (Twilio webhooks) can wait on locks. Keep updates narrow and avoid long transactions.",
    });
  }

  if (innodb.bufferHitRatio != null && innodb.bufferHitRatio < 0.99) {
    hints.push({
      severity: "warn",
      title: "Buffer pool hit ratio below 99%",
      detail: "Working set may exceed buffer pool or cold cache after restart. Re-check after traffic stabilizes.",
    });
  }

  if (toNum(efficiency.deletes) < 10 && toNum(efficiency.selects) > 100000) {
    hints.push({
      severity: "info",
      title: "Almost no DELETEs",
      detail:
        "History tables only grow. After indexes look healthy, consider archiving old CallLogs / UserActivities.",
    });
  }

  if (hints.length === 0) {
    hints.push({
      severity: "ok",
      title: "No major thresholds tripped",
      detail: "Status looks calm for the current counters. Re-check after peak traffic.",
    });
  }

  return hints;
}

async function loadTableSizes() {
  const rows = await db.sequelize.query(
    `SELECT
       TABLE_NAME AS tableName,
       TABLE_ROWS AS tableRows,
       DATA_LENGTH AS dataLength,
       INDEX_LENGTH AS indexLength,
       (DATA_LENGTH + INDEX_LENGTH) AS totalLength
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
     LIMIT 40`,
    { type: QueryTypes.SELECT },
  );

  return rows.map((row) => ({
    tableName: row.tableName,
    tableRows: toNum(row.tableRows),
    dataLength: toNum(row.dataLength),
    indexLength: toNum(row.indexLength),
    totalLength: toNum(row.totalLength),
  }));
}

async function loadStatementDigests() {
  try {
    const rows = await db.sequelize.query(
      `SELECT
         DIGEST_TEXT AS digestText,
         COUNT_STAR AS execCount,
         ROUND(SUM_TIMER_WAIT / 1e12, 3) AS sumTimeSeconds,
         ROUND(AVG_TIMER_WAIT / 1e12, 6) AS avgTimeSeconds,
         SUM_ROWS_EXAMINED AS rowsExamined,
         SUM_ROWS_SENT AS rowsSent
       FROM performance_schema.events_statements_summary_by_digest
       WHERE SCHEMA_NAME = DATABASE()
         AND DIGEST_TEXT IS NOT NULL
       ORDER BY SUM_TIMER_WAIT DESC
       LIMIT 20`,
      { type: QueryTypes.SELECT },
    );

    return {
      digestsAvailable: true,
      digests: rows.map((row) => ({
        digestText: String(row.digestText || "").slice(0, 500),
        execCount: toNum(row.execCount),
        sumTimeSeconds: toNum(row.sumTimeSeconds),
        avgTimeSeconds: toNum(row.avgTimeSeconds),
        rowsExamined: toNum(row.rowsExamined),
        rowsSent: toNum(row.rowsSent),
      })),
    };
  } catch (err) {
    return {
      digestsAvailable: false,
      digests: [],
      digestsError: err?.message || "performance_schema unavailable",
    };
  }
}

/**
 * Read-only MySQL health snapshot for admin UI.
 */
export async function collectSqlHealth() {
  const [status, variables, tables, digestResult] = await Promise.all([
    showMap("status", STATUS_KEYS),
    showMap("variables", VARIABLE_KEYS),
    loadTableSizes(),
    loadStatementDigests(),
  ]);

  const selectScan = toNum(status.Select_scan);
  const comSelect = toNum(status.Com_select);
  const readRequests = toNum(status.Innodb_buffer_pool_read_requests);
  const diskReads = toNum(status.Innodb_buffer_pool_reads);
  const pagesTotal = toNum(status.Innodb_buffer_pool_pages_total);
  const pagesData = toNum(status.Innodb_buffer_pool_pages_data);
  const bufferPoolSize = toNum(variables.innodb_buffer_pool_size);
  const maxConnections = toNum(variables.max_connections);
  const threadsConnected = toNum(status.Threads_connected);

  const overview = {
    version: variables.version || null,
    uptimeSeconds: toNum(status.Uptime),
    threadsConnected,
    threadsRunning: toNum(status.Threads_running),
    maxConnections,
    connectionUsageRatio: ratio(threadsConnected, maxConnections),
    longQueryTimeSeconds: toNum(variables.long_query_time),
  };

  const efficiency = {
    questions: toNum(status.Questions),
    queries: toNum(status.Queries),
    slowQueries: toNum(status.Slow_queries),
    selects: comSelect,
    inserts: toNum(status.Com_insert),
    updates: toNum(status.Com_update),
    deletes: toNum(status.Com_delete),
    selectScans: selectScan,
    fullJoins: toNum(status.Select_full_join),
    rangeSelects: toNum(status.Select_range),
    sortMergePasses: toNum(status.Sort_merge_passes),
    tmpTables: toNum(status.Created_tmp_tables),
    tmpDiskTables: toNum(status.Created_tmp_disk_tables),
    tmpDiskRatio: ratio(status.Created_tmp_disk_tables, status.Created_tmp_tables),
    tableScanRatio: ratio(selectScan, comSelect),
    rowsRead: toNum(status.Innodb_rows_read),
    rowsInserted: toNum(status.Innodb_rows_inserted),
    rowsUpdated: toNum(status.Innodb_rows_updated),
    rowsDeleted: toNum(status.Innodb_rows_deleted),
  };

  const innodb = {
    bufferPoolSizeBytes: bufferPoolSize,
    bufferPoolPagesTotal: pagesTotal,
    bufferPoolPagesData: pagesData,
    bufferPoolPagesFree: toNum(status.Innodb_buffer_pool_pages_free),
    bufferPoolPagesDirty: toNum(status.Innodb_buffer_pool_pages_dirty),
    bufferPoolUsageRatio: ratio(pagesData, pagesTotal),
    bufferHitRatio: readRequests > 0 ? Math.max(0, Math.min(1, 1 - diskReads / readRequests)) : null,
    dataReads: toNum(status.Innodb_data_reads),
    dataWrites: toNum(status.Innodb_data_writes),
  };

  const connections = {
    abortedClients: toNum(status.Aborted_clients),
    abortedConnects: toNum(status.Aborted_connects),
    maxUsedConnections: toNum(status.Max_used_connections),
    bytesReceived: toNum(status.Bytes_received),
    bytesSent: toNum(status.Bytes_sent),
  };

  const locks = {
    rowLockWaits: toNum(status.Innodb_row_lock_waits),
    rowLockTimeMs: toNum(status.Innodb_row_lock_time),
  };

  return {
    collectedAt: new Date().toISOString(),
    overview,
    efficiency,
    innodb,
    connections,
    locks,
    tables,
    ...digestResult,
    hints: buildHints({ efficiency, connections, locks, innodb }),
  };
}
