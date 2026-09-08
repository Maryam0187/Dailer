import { Op } from "sequelize";
import db from "@/server/db";

function trimField(value, maxLen) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function parseAmount(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).trim().replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseDateMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value).trim());
  return Number.isNaN(ms) ? null : ms;
}

/** Calendar-day window around a txn time (±1 day) for soft matching. */
function dateWindowAround(ms, { days = 1 } = {}) {
  if (ms == null) return null;
  const start = new Date(ms);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  const end = new Date(ms);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + days);
  return { from: start, to: end };
}

function publicFields(fields) {
  return {
    authCode: fields.authCode,
    arn: fields.arn,
    processorTransactionId: fields.processorTransactionId,
    cardLast4: fields.cardLast4,
    amount: fields.amount,
    transactionDate: fields.transactionDate,
  };
}

/** Extract Chargeflow alert fields used to match CustomerCharge rows. */
export function extractAlertMatchFields(alert) {
  const nt =
    alert?.network_transaction && typeof alert.network_transaction === "object"
      ? alert.network_transaction
      : {};

  const amountRaw = nt.amount ?? alert?.amount;
  const dateRaw = nt.created_at ?? alert?.transaction_date ?? alert?.created_at;

  return {
    authCode: trimField(nt.auth_code ?? alert?.auth_code ?? alert?.authCode, 64),
    arn: trimField(nt.arn ?? alert?.arn, 128),
    processorTransactionId: trimField(
      alert?.transaction ?? nt.id ?? alert?.processorTransactionId,
      128,
    ),
    cardLast4: trimField(nt.last4 ?? alert?.last4, 4),
    amount: parseAmount(amountRaw),
    transactionDate: dateRaw ? String(dateRaw).trim() || null : null,
  };
}

function fieldMatches(row, fields) {
  const last4Matched = Boolean(
    fields.cardLast4 &&
      row.cardLast4 &&
      String(row.cardLast4).trim() === fields.cardLast4,
  );

  let amountMatched = false;
  if (fields.amount != null && row.amount != null) {
    const rowAmt = Math.round(Number(row.amount) * 100) / 100;
    amountMatched = Number.isFinite(rowAmt) && rowAmt === fields.amount;
  }

  let dateMatched = false;
  let dateDiffDays = null;
  if (fields.transactionDateMs != null && row.createdAt) {
    const rowMs = new Date(row.createdAt).getTime();
    if (!Number.isNaN(rowMs)) {
      dateDiffDays = Math.abs(rowMs - fields.transactionDateMs) / (24 * 60 * 60 * 1000);
      dateMatched = dateDiffDays <= 1;
    }
  }

  return { last4Matched, amountMatched, dateMatched, dateDiffDays };
}

function scoreCharge(row, fields, { softOnly = false } = {}) {
  const flags = fieldMatches(row, fields);
  let score = 0;

  if (!softOnly) {
    if (fields.arn && row.arn && String(row.arn).trim() === fields.arn) score += 100;
    if (
      fields.processorTransactionId &&
      row.processorTransactionId &&
      String(row.processorTransactionId).trim() === fields.processorTransactionId
    ) {
      score += 80;
    }
    if (fields.authCode && row.authCode && String(row.authCode).trim() === fields.authCode) {
      score += 40;
    }
  }

  // Soft: amount + date are the match; last4 is optional (matched or not).
  if (flags.amountMatched) score += softOnly ? 40 : 8;
  if (flags.dateMatched) score += softOnly ? 35 : 5;
  else if (flags.dateDiffDays != null && flags.dateDiffDays <= 2) score += softOnly ? 10 : 2;

  if (flags.last4Matched) score += softOnly ? 30 : 10;
  else if (softOnly && fields.cardLast4) score -= 5; // prefer last4 matches when alert has last4

  return { score, flags };
}

function serializeMatch(row, flags = {}) {
  const customer = row.customer || null;
  return {
    chargeId: row.id,
    customerId: row.customerId,
    leadId: row.leadId ?? null,
    status: row.status,
    amount: row.amount != null ? Number(row.amount) : null,
    authCode: row.authCode || null,
    arn: row.arn || null,
    processorTransactionId: row.processorTransactionId || null,
    cardLast4: row.cardLast4 || null,
    cardBrand: row.cardBrand || null,
    chargedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    matched: {
      last4: Boolean(flags.last4Matched),
      amount: Boolean(flags.amountMatched),
      date: Boolean(flags.dateMatched),
    },
    customer: customer
      ? {
          id: customer.id,
          fullName: customer.fullName || null,
          phone: customer.phone || null,
          isOutside: Boolean(customer.isOutside),
        }
      : null,
    href:
      row.customerId != null
        ? `/customers?customerId=${row.customerId}${
            row.leadId ? `&leadId=${row.leadId}` : ""
          }`
        : null,
  };
}

const customerInclude = {
  model: db.Customer,
  as: "customer",
  attributes: ["id", "fullName", "phone", "isOutside"],
  required: false,
};

function rankRows(rows, fields, { softOnly = false } = {}) {
  return rows
    .map((row) => {
      const { score, flags } = scoreCharge(row, fields, { softOnly });
      return { row, score, flags };
    })
    .filter((entry) => {
      if (softOnly) {
        // Soft results must match amount + date; last4 may or may not.
        return entry.flags.amountMatched && entry.flags.dateMatched;
      }
      return entry.score > 0;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Prefer last4 matched when scores tie
      if (Boolean(b.flags.last4Matched) !== Boolean(a.flags.last4Matched)) {
        return b.flags.last4Matched ? 1 : -1;
      }
      const at = a.row.createdAt ? new Date(a.row.createdAt).getTime() : 0;
      const bt = b.row.createdAt ? new Date(b.row.createdAt).getTime() : 0;
      return bt - at;
    })
    .map(({ row, score, flags }) => ({
      ...serializeMatch(row, flags),
      matchScore: score,
      matchMode: softOnly ? "soft" : "strong",
    }));
}

/**
 * Find CustomerCharge rows that match Chargeflow alert identifiers.
 * Prefer ARN / processor txn id / auth code.
 * Soft fallback: amount + transaction date (last4 matched or not — ranked higher if yes).
 */
export async function matchChargesFromAlertFields(rawFields = {}) {
  const transactionDateMs = parseDateMs(rawFields.transactionDate);
  const fields = {
    authCode: trimField(rawFields.authCode, 64),
    arn: trimField(rawFields.arn, 128),
    processorTransactionId: trimField(rawFields.processorTransactionId, 128),
    cardLast4: trimField(rawFields.cardLast4, 4),
    amount: parseAmount(rawFields.amount),
    transactionDate: rawFields.transactionDate
      ? String(rawFields.transactionDate).trim() || null
      : null,
    transactionDateMs,
  };

  const strongOr = [];
  if (fields.arn) strongOr.push({ arn: fields.arn });
  if (fields.processorTransactionId) {
    strongOr.push({ processorTransactionId: fields.processorTransactionId });
  }
  if (fields.authCode) strongOr.push({ authCode: fields.authCode });

  if (strongOr.length > 0) {
    const rows = await db.CustomerCharge.findAll({
      where: { [Op.or]: strongOr },
      include: [customerInclude],
      order: [["createdAt", "DESC"]],
      limit: 25,
    });

    return {
      fields: publicFields(fields),
      matchMode: "strong",
      matches: rankRows(rows, fields, { softOnly: false }),
    };
  }

  // Soft fallback: amount + transaction date required; last4 optional (matched or not).
  if (fields.amount == null || transactionDateMs == null) {
    return {
      fields: publicFields(fields),
      matches: [],
      reason: "no_match_fields",
    };
  }

  const window = dateWindowAround(transactionDateMs, { days: 1 });
  const where = {
    amount: fields.amount,
    createdAt: { [Op.between]: [window.from, window.to] },
    status: { [Op.in]: ["charged", "chargeback"] },
  };

  const rows = await db.CustomerCharge.findAll({
    where,
    include: [customerInclude],
    order: [["createdAt", "DESC"]],
    limit: 40,
  });

  return {
    fields: publicFields(fields),
    matchMode: "soft",
    matches: rankRows(rows, fields, { softOnly: true }).slice(0, 25),
  };
}
