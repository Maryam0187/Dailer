import twilio from "twilio";
import db from "@/server/db";
import { getTwilioClient } from "@/server/twilio";

/** Categories included on every bill (Twilio Usage Records). */
export const BILLING_USAGE_CATEGORIES = [
  { key: "calls", label: "Programmable Voice" },
  { key: "calls-client", label: "Client" },
  { key: "recordings", label: "Recording" },
  { key: "phonenumbers", label: "Phone Numbers" },
];

function formatYmd(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Sum Twilio UsageRecord price/count/usage for one category over a date range.
 * Daily records are returned for the range; we aggregate them.
 */
async function fetchCategoryUsage(client, categoryKey, { fromDate, toDate }) {
  const startDate = formatYmd(fromDate);
  const endDate = formatYmd(toDate);
  const records = await client.usage.records.list({
    category: categoryKey,
    startDate,
    endDate,
    pageSize: 1000,
  });

  let priceCents = 0;
  let count = 0;
  let usage = 0;
  let usageUnit = null;
  let priceUnit = "USD";

  for (const row of records || []) {
    const p = Math.abs(Number(row.price));
    if (Number.isFinite(p)) {
      priceCents += Math.round(p * 100);
    }
    const c = Number(row.count);
    if (Number.isFinite(c)) count += c;
    const u = Number(row.usage);
    if (Number.isFinite(u)) usage += u;
    if (row.usageUnit) usageUnit = String(row.usageUnit);
    if (row.priceUnit) priceUnit = String(row.priceUnit);
  }

  return {
    category: categoryKey,
    price: (priceCents / 100).toFixed(2),
    priceUnit,
    count,
    usage,
    usageUnit,
  };
}

/**
 * Fetch Client + Programmable Voice + Recording + Phone Numbers usage for billing.
 * @returns {Promise<Array<{ category: string, label: string, price: string, priceUnit: string, count: number, usage: number, usageUnit: string | null }>>}
 */
export async function listBillingUsageForClient(client, { fromDate, toDate }) {
  const rows = await Promise.all(
    BILLING_USAGE_CATEGORIES.map(async (meta) => {
      const usage = await fetchCategoryUsage(client, meta.key, { fromDate, toDate });
      return { ...usage, label: meta.label };
    }),
  );
  return rows;
}

/**
 * @deprecated Prefer listBillingUsageForClient — kept for older call-list tests.
 */
export async function listCompletedCallsForClient(client, { fromDate, toDate }) {
  const after = new Date(fromDate);
  const before = new Date(toDate);
  before.setDate(before.getDate() + 1);

  const calls = await client.calls.list({
    startTimeAfter: after,
    startTimeBefore: before,
    status: "completed",
    pageSize: 1000,
  });

  return calls.filter((call) => {
    const twilioCost = Math.abs(Number(call.price));
    return Number.isFinite(twilioCost) && twilioCost > 0;
  });
}

/**
 * Resolve Twilio client for billing: main account, or a manager's subaccount.
 * @param {number | null | undefined} managerId
 * @returns {Promise<{ client: import("twilio").Twilio, managerId: number | null, managerUsername: string | null }>}
 */
export async function resolveBillingTwilioClient(managerId) {
  const id = managerId != null && managerId !== "" ? Number(managerId) : null;
  if (!Number.isInteger(id) || id < 1) {
    return {
      client: await getTwilioClient(),
      managerId: null,
      managerUsername: null,
    };
  }

  const manager = await db.User.findByPk(id, {
    attributes: ["id", "username", "role"],
  });
  if (!manager || manager.role !== "manager") {
    const err = new Error("managerId must refer to a manager");
    err.status = 400;
    throw err;
  }

  const acct = await db.ManagerTwilioAccount.findOne({ where: { managerId: id } });
  if (!acct) {
    const err = new Error(
      "This team has no Twilio subaccount. Configure it under Admin → Twilio numbers, or generate an account-wide (main) bill.",
    );
    err.status = 400;
    throw err;
  }

  return {
    client: twilio(String(acct.accountSid).trim(), String(acct.authToken).trim()),
    managerId: id,
    managerUsername: manager.username,
  };
}
