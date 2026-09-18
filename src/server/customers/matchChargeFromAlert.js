import { Op } from "sequelize";
import db from "@/server/db";
import { cardLast4FromNumber, brandFromPaymentMethod } from "@/server/customers/chargeCardSnapshot";

const SOFT_DATE_DAYS = 1;
const ENC_PREFIX = "enc.v1:";

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

/** Soft date window around network txn time (±1 day, UTC calendar days). */
function dateWindowAround(ms, { days = SOFT_DATE_DAYS } = {}) {
  if (ms == null) return null;
  const start = new Date(ms);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days);
  const end = new Date(ms);
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() + days);
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

/**
 * Effective last4 from charge snapshot or decrypted PM card number.
 * Never derive digits from still-encrypted enc.v1 payloads (wrong last4).
 */
function effectiveCardLast4(row) {
  const stored = trimField(row?.cardLast4, 4);
  if (stored) return { last4: stored, source: "charge" };

  const pm = row?.paymentMethod;
  if (!pm || pm.type !== "card") return { last4: null, source: null };

  const raw = pm.cardNumber;
  if (raw == null || raw === "") return { last4: null, source: null };
  if (String(raw).startsWith(ENC_PREFIX)) {
    return { last4: null, source: "encrypted" };
  }

  const last4 = cardLast4FromNumber(raw);
  return { last4, source: last4 ? "paymentMethod" : null };
}

function effectiveCardBrand(row) {
  const stored = trimField(row?.cardBrand, 32);
  if (stored) return stored;
  return brandFromPaymentMethod(row?.paymentMethod) || null;
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
      alert?.processorTransactionId ?? alert?.transaction,
      128,
    ),
    cardLast4: trimField(nt.last4 ?? alert?.last4, 4),
    amount: parseAmount(amountRaw),
    transactionDate: dateRaw ? String(dateRaw).trim() || null : null,
  };
}

function fieldMatches(row, fields) {
  const { last4: rowLast4, source: last4Source } = effectiveCardLast4(row);

  let last4Matched = false;
  let last4Conflict = false;
  let last4Unknown = false;

  if (fields.cardLast4) {
    if (rowLast4) {
      last4Matched = rowLast4 === fields.cardLast4;
      last4Conflict = !last4Matched;
    } else {
      last4Unknown = true;
    }
  }

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
      dateMatched = dateDiffDays <= SOFT_DATE_DAYS;
    }
  }

  const authMatched = Boolean(
    fields.authCode &&
      row.authCode &&
      String(row.authCode).trim().toUpperCase() === fields.authCode.toUpperCase(),
  );
  const arnMatched = Boolean(
    fields.arn && row.arn && String(row.arn).trim() === fields.arn,
  );
  const txnMatched = Boolean(
    fields.processorTransactionId &&
      row.processorTransactionId &&
      String(row.processorTransactionId).trim() === fields.processorTransactionId,
  );

  return {
    last4Matched,
    last4Conflict,
    last4Unknown,
    last4Source,
    amountMatched,
    dateMatched,
    dateDiffDays,
    authMatched,
    arnMatched,
    txnMatched,
    effectiveLast4: rowLast4,
  };
}

function scoreCharge(row, fields, { mode } = {}) {
  const flags = fieldMatches(row, fields);
  let score = 0;

  if (mode === "primary") {
    if (flags.last4Matched) score += 100;
    if (flags.amountMatched) score += 80;
    if (flags.dateMatched) score += 10;
  } else {
    // Previous soft/fallback scoring.
    if (flags.arnMatched) score += 100;
    if (flags.txnMatched) score += 80;
    if (flags.authMatched) score += 60;
    if (flags.last4Matched) score += 50;
    else if (flags.last4Unknown) score += 5;
    if (flags.amountMatched) score += 35;
    if (flags.dateMatched) {
      const closeness =
        flags.dateDiffDays == null ? 0 : Math.max(0, SOFT_DATE_DAYS - flags.dateDiffDays);
      score += 25 + Math.round(closeness * 5);
    }
  }

  if (row.status === "chargeback") score += 5;

  return { score, flags };
}

function serializeMatch(row, flags = {}, matchMode = "soft") {
  const customer = row.customer || null;
  const last4 = flags.effectiveLast4 || effectiveCardLast4(row).last4;
  const confidence =
    matchMode === "primary" || flags.last4Matched
      ? "high"
      : flags.last4Unknown
        ? "partial"
        : "high";
  return {
    chargeId: row.id,
    customerId: row.customerId,
    leadId: row.leadId ?? null,
    status: row.status,
    amount: row.amount != null ? Number(row.amount) : null,
    authCode: row.authCode || null,
    arn: row.arn || null,
    processorTransactionId: row.processorTransactionId || null,
    cardLast4: last4,
    cardBrand: effectiveCardBrand(row),
    chargedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    confidence,
    matched: {
      last4: Boolean(flags.last4Matched),
      last4Unknown: Boolean(flags.last4Unknown),
      amount: Boolean(flags.amountMatched),
      date: Boolean(flags.dateMatched),
      authCode: Boolean(flags.authMatched),
      arn: Boolean(flags.arnMatched),
      processorTransactionId: Boolean(flags.txnMatched),
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

const paymentMethodInclude = {
  model: db.CustomerPaymentMethod,
  as: "paymentMethod",
  attributes: ["id", "type", "cardNumber", "brand", "cardType"],
  required: false,
};

function rankAndSerialize(rows, fields, { mode, filterFn }) {
  return rows
    .map((row) => {
      const { score, flags } = scoreCharge(row, fields, { mode });
      return { row, score, flags };
    })
    .filter(filterFn)
    .sort((a, b) => {
      if (mode !== "primary") {
        const aExact = a.flags.last4Matched ? 1 : 0;
        const bExact = b.flags.last4Matched ? 1 : 0;
        if (bExact !== aExact) return bExact - aExact;
      }
      if (b.score !== a.score) return b.score - a.score;
      const at = a.row.createdAt ? new Date(a.row.createdAt).getTime() : 0;
      const bt = b.row.createdAt ? new Date(b.row.createdAt).getTime() : 0;
      return bt - at;
    })
    .map(({ row, score, flags }) => {
      let matchMode = mode;
      if (mode !== "primary") {
        if (flags.arnMatched || flags.txnMatched || flags.authMatched) matchMode = "strong";
        else if (flags.last4Matched) matchMode = "soft";
        else matchMode = "partial";
      }
      return {
        ...serializeMatch(row, flags, matchMode),
        matchScore: score,
        matchMode,
      };
    });
}

async function findCharges(where) {
  return db.CustomerCharge.findAll({
    where,
    include: [customerInclude, paymentMethodInclude],
    order: [["createdAt", "DESC"]],
    limit: 80,
  });
}

/**
 * 1) Primary: last4 + amount only
 * 2) Fallback (same as before): amount + date (±1 day), last4 matched or unknown;
 *    plus auth / ARN / processor txn id when present
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

  const hasPrimary = Boolean(fields.cardLast4) && fields.amount != null;
  const hasSoftFallback = fields.amount != null && transactionDateMs != null;
  const hasStrong = Boolean(
    fields.arn || fields.processorTransactionId || fields.authCode,
  );

  if (!hasPrimary && !hasSoftFallback && !hasStrong) {
    return {
      fields: publicFields(fields),
      matches: [],
      reason: "no_match_fields",
    };
  }

  // ---- 1) Primary: last4 + amount only ----
  if (hasPrimary) {
    const primaryRows = await findCharges({
      amount: fields.amount,
      status: { [Op.in]: ["charged", "chargeback"] },
      [Op.or]: [
        { cardLast4: fields.cardLast4 },
        { cardLast4: null },
        { cardLast4: "" },
      ],
    });

    const primaryMatches = rankAndSerialize(primaryRows, fields, {
      mode: "primary",
      filterFn: (entry) => entry.flags.last4Matched && entry.flags.amountMatched,
    }).slice(0, 25);

    if (primaryMatches.length > 0) {
      return {
        fields: publicFields(fields),
        matchMode: "primary",
        matches: primaryMatches,
      };
    }
  }

  // ---- 2) Fallback: previous soft logic (amount + date ±1, last4 optional) + strong ids ----
  const or = [];

  if (hasSoftFallback) {
    const window = dateWindowAround(transactionDateMs, { days: SOFT_DATE_DAYS });
    or.push({
      amount: fields.amount,
      createdAt: { [Op.between]: [window.from, window.to] },
      status: { [Op.in]: ["charged", "chargeback"] },
    });
  }

  if (fields.arn) or.push({ arn: fields.arn });
  if (fields.processorTransactionId) {
    or.push({ processorTransactionId: fields.processorTransactionId });
  }
  if (fields.authCode) {
    or.push({ authCode: fields.authCode });
    const upper = fields.authCode.toUpperCase();
    const lower = fields.authCode.toLowerCase();
    if (upper !== fields.authCode) or.push({ authCode: upper });
    if (lower !== fields.authCode) or.push({ authCode: lower });
  }

  if (or.length === 0) {
    return {
      fields: publicFields(fields),
      matchMode: null,
      matches: [],
    };
  }

  const fallbackRows = await findCharges({ [Op.or]: or });
  const fallbackMatches = rankAndSerialize(fallbackRows, fields, {
    mode: "soft",
    filterFn: (entry) => {
      if (entry.flags.arnMatched || entry.flags.txnMatched || entry.flags.authMatched) {
        return true;
      }
      // Previous soft rule: amount + date (±1).
      if (!entry.flags.amountMatched || !entry.flags.dateMatched) return false;
      if (entry.flags.last4Conflict) return false;
      // Exact last4, or unknown last4 on older charges.
      return entry.flags.last4Matched || entry.flags.last4Unknown;
    },
  }).slice(0, 25);

  return {
    fields: publicFields(fields),
    matchMode: fallbackMatches[0]?.matchMode || "soft",
    matches: fallbackMatches,
  };
}
