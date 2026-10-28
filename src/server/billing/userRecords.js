import { Op, QueryTypes } from "sequelize";
import db from "@/server/db";
import { calendarDateRangeBounds } from "@/lib/calendarDayBounds";
import { teamManagerLabel } from "@/lib/teamManagerLabel";
import { aggregateCallMetricsFromDaily } from "@/server/calls/aggregateMetrics";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_USER_RECORDS = 40;

export function billingDateOnly(value) {
  if (typeof value === "string" && DATE_ONLY.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function userOnTeam(user, managerId) {
  if (managerId == null) return true;
  return Number(user.id) === managerId || Number(user.managerId) === managerId;
}

/**
 * Call-metric row for one user over the invoice dates.
 * Counts match the call metrics report (daily rollup).
 */
export async function loadUserMetricRecord({ userId, fromDate, toDate, managerId }) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    throw httpError("Select a user", 400);
  }

  const fromOnly = billingDateOnly(fromDate);
  const toOnly = billingDateOnly(toDate);
  if (!fromOnly || !toOnly) {
    throw httpError("fromDate and toDate are required", 400);
  }
  if (fromOnly > toOnly) {
    throw httpError("fromDate must be on or before toDate", 400);
  }

  const scopedManager =
    managerId != null && managerId !== "" ? Number(managerId) : null;
  if (scopedManager != null && (!Number.isInteger(scopedManager) || scopedManager < 1)) {
    throw httpError("Invalid team", 400);
  }

  const user = await db.User.findByPk(id, {
    attributes: ["id", "username", "displayName", "managerId", "role"],
    include: [
      {
        model: db.User,
        as: "manager",
        attributes: ["id", "username", "displayName", "role"],
        required: false,
      },
    ],
  });
  if (!user) throw httpError("User not found", 404);
  if (!userOnTeam(user, scopedManager)) {
    throw httpError("That user is not on this team", 400);
  }

  const metrics = await aggregateCallMetricsFromDaily({
    userId: id,
    fromDate: fromOnly,
    toDate: toOnly,
  });

  const managerPerson = user.role === "manager" ? user : user.manager;
  return {
    userId: id,
    username: String(user.username || "").trim() || `User ${id}`,
    managerLabel: teamManagerLabel(managerPerson),
    total: metrics.total,
    completed: metrics.completed,
    noAnswer: metrics.noAnswer,
    failedOrCanceled: metrics.failedOrCanceled,
    busy: metrics.busy,
    durationSeconds: toInt(metrics.twilioDurationSeconds),
  };
}

function invoiceUserName(user) {
  const displayName = String(user?.displayName || "").trim();
  if (displayName) return displayName;
  return String(user?.username || "").trim() || `User ${user?.id}`;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Talk time for calls that are not Zoom. Matches the Twilio half of the user report. */
async function twilioDurationSecondsByUser(userIds, fromDate, toDate) {
  const durations = new Map();
  const ids = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return durations;

  const bounds = calendarDateRangeBounds(fromDate, toDate);
  if (!bounds) return durations;

  const rows = await db.sequelize.query(
    `SELECT cl.userId AS userId,
            COALESCE(SUM(CASE
              WHEN LOWER(COALESCE(cl.voiceProvider, 'twilio')) = 'zoom' THEN 0
              ELSE cl.durationSeconds
            END), 0) AS durationSeconds
     FROM CallLogs cl
     WHERE cl.userId IN (:userIds)
       AND cl.createdAt >= :after
       AND cl.createdAt < :before
     GROUP BY cl.userId`,
    {
      replacements: { userIds: ids, after: bounds.after, before: bounds.before },
      type: QueryTypes.SELECT,
    },
  );

  for (const row of rows) {
    durations.set(Number(row.userId), toInt(row.durationSeconds));
  }
  return durations;
}

async function accountUserWhere(scopedManager) {
  if (scopedManager) {
    return {
      [Op.and]: [
        { role: { [Op.ne]: "admin" } },
        { [Op.or]: [{ id: scopedManager }, { managerId: scopedManager }] },
      ],
    };
  }

  const teamAccounts = await db.ManagerTwilioAccount.findAll({
    attributes: ["managerId"],
    raw: true,
  });
  const teamManagerIds = teamAccounts
    .map((row) => Number(row.managerId))
    .filter((id) => Number.isInteger(id) && id > 0);

  const parts = [{ role: { [Op.ne]: "admin" } }];
  if (teamManagerIds.length) {
    parts.push({
      [Op.or]: [{ managerId: null }, { managerId: { [Op.notIn]: teamManagerIds } }],
    });
    parts.push({ id: { [Op.notIn]: teamManagerIds } });
  }
  return { [Op.and]: parts };
}

/**
 * Every user on the billing account who dialed in the range.
 * Users with zero calls are omitted.
 */
export async function listAccountUserRecords({ fromDate, toDate, managerId }) {
  const fromOnly = billingDateOnly(fromDate);
  const toOnly = billingDateOnly(toDate);
  if (!fromOnly || !toOnly) {
    throw httpError("fromDate and toDate are required", 400);
  }
  if (fromOnly > toOnly) {
    throw httpError("fromDate must be on or before toDate", 400);
  }

  const scopedManager = managerId != null && managerId !== "" ? Number(managerId) : null;
  if (scopedManager != null && (!Number.isInteger(scopedManager) || scopedManager < 1)) {
    throw httpError("Invalid team", 400);
  }

  const users = await db.User.findAll({
    where: await accountUserWhere(scopedManager),
    attributes: ["id", "username", "displayName", "managerId", "role"],
    include: [
      {
        model: db.User,
        as: "manager",
        attributes: ["id", "username", "displayName", "role"],
        required: false,
      },
    ],
  });
  if (!users.length) return [];

  const { fn, col } = db.sequelize;
  const rows = await db.CallDailyMetric.findAll({
    attributes: [
      "userId",
      [fn("SUM", col("total")), "total"],
      [fn("SUM", col("completed")), "completed"],
      [fn("SUM", col("noAnswer")), "noAnswer"],
      [fn("SUM", col("failedOrCanceled")), "failedOrCanceled"],
      [fn("SUM", col("busy")), "busy"],
    ],
    where: {
      userId: users.map((user) => user.id),
      calendarDate: { [Op.gte]: fromOnly, [Op.lte]: toOnly },
    },
    group: ["userId"],
    raw: true,
  });
  const metricsByUserId = new Map(rows.map((row) => [Number(row.userId), row]));
  const twilioDurationByUser = await twilioDurationSecondsByUser(
    users.map((user) => user.id),
    fromOnly,
    toOnly,
  );

  const records = [];
  for (const user of users) {
    const metrics = metricsByUserId.get(user.id);
    const total = toInt(metrics?.total);
    if (total <= 0) continue;
    const managerPerson = user.role === "manager" ? user : user.manager;
    records.push({
      userId: user.id,
      name: invoiceUserName(user),
      username: String(user.username || "").trim(),
      managerLabel: teamManagerLabel(managerPerson),
      total,
      completed: toInt(metrics?.completed),
      noAnswer: toInt(metrics?.noAnswer),
      failedOrCanceled: toInt(metrics?.failedOrCanceled),
      busy: toInt(metrics?.busy),
      durationSeconds: twilioDurationByUser.get(user.id) || 0,
    });
  }

  records.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
  return records;
}

/** Resolve invoice rows from selected user ids. Later duplicates are ignored. */
export async function resolveInvoiceUserRecords(input, { fromDate, toDate, managerId }) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw httpError("userRecords must be a list", 400);
  }
  if (input.length > MAX_USER_RECORDS) {
    throw httpError(`Add at most ${MAX_USER_RECORDS} user records`, 400);
  }

  const seen = new Set();
  const records = [];
  for (const row of input) {
    const userId = Number(row?.userId);
    if (!Number.isInteger(userId) || userId < 1) {
      throw httpError("Select a user for each record", 400);
    }
    if (seen.has(userId)) continue;
    seen.add(userId);
    records.push(
      await loadUserMetricRecord({ userId, fromDate, toDate, managerId }),
    );
  }
  return records;
}
