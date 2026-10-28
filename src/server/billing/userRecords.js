import db from "@/server/db";
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
    durationSeconds: metrics.durationSeconds,
  };
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
