import { Op } from "sequelize";
import db from "@/server/db";
import {
  PAYMENT_LEAD_UPDATE_TYPE_VALUES,
  parseEmbeddedPaymentChargeAmount,
  parsePaymentAmountSetActivity,
  parsePaymentDeclineReasonFromActivityBody,
  parsePaymentProcessorLabelFromActivityBody,
} from "@/lib/leadWorkflow";
import { dateRangeWhere, dateRangeWhereOn } from "@/server/calls/aggregateMetrics";
import { listPaymentProcessors } from "@/server/paymentProcessors/registry";

function emptyBucket() {
  return {
    chargedCount: 0,
    chargedAmount: 0,
    declinedCount: 0,
    declinedAmount: 0,
    chargebackCount: 0,
    chargebackAmount: 0,
  };
}

function addEvent(bucket, status, amount) {
  const value = amount != null && Number.isFinite(amount) ? amount : 0;
  if (status === "charged") {
    bucket.chargedCount += 1;
    bucket.chargedAmount += value;
  } else if (status === "declined") {
    bucket.declinedCount += 1;
    bucket.declinedAmount += value;
  } else if (status === "chargeback") {
    bucket.chargebackCount += 1;
    bucket.chargebackAmount += value;
  }
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function finalizeBucket(bucket) {
  return {
    chargedCount: bucket.chargedCount,
    chargedAmount: roundMoney(bucket.chargedAmount),
    declinedCount: bucket.declinedCount,
    declinedAmount: roundMoney(bucket.declinedAmount),
    chargebackCount: bucket.chargebackCount,
    chargebackAmount: roundMoney(bucket.chargebackAmount),
  };
}

function statusFromType(type) {
  if (type === "payment_charged") return "charged";
  if (type === "payment_declined") return "declined";
  if (type === "payment_chargeback") return "chargeback";
  return null;
}

function dayKeyFromDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function eachDayInclusive(fromDate, toDate) {
  const days = [];
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function resolveEventAmount(row, amountTimeline, leadFallbackAmount) {
  const embedded = parseEmbeddedPaymentChargeAmount(row.body);
  if (embedded != null) return embedded;

  const timeline = amountTimeline.get(row.leadId) || [];
  const eventAt = new Date(row.createdAt).getTime();
  let amount = null;
  for (const point of timeline) {
    if (point.at <= eventAt) amount = point.amount;
    else break;
  }
  if (amount != null) return amount;
  if (leadFallbackAmount != null && Number.isFinite(Number(leadFallbackAmount))) {
    return Number(leadFallbackAmount);
  }
  return null;
}

async function loadAmountTimelines(leadIds) {
  const map = new Map();
  if (!leadIds.length) return map;

  const rows = await db.LeadUpdate.findAll({
    where: {
      leadId: { [Op.in]: leadIds },
      [Op.or]: [
        { body: { [Op.like]: "Charge amount set to%" } },
        { body: { [Op.like]: "Charge amount cleared%" } },
      ],
    },
    attributes: ["leadId", "body", "createdAt"],
    order: [
      ["leadId", "ASC"],
      ["createdAt", "ASC"],
      ["id", "ASC"],
    ],
  });

  for (const row of rows) {
    const parsed = parsePaymentAmountSetActivity(row.body);
    if (parsed === undefined) continue;
    const list = map.get(row.leadId) || [];
    list.push({ at: new Date(row.createdAt).getTime(), amount: parsed });
    map.set(row.leadId, list);
  }
  return map;
}

/** Build lookup: shortCode/code (lower) → processor code. */
async function buildProcessorLabelToCode() {
  const processors = await listPaymentProcessors({ activeOnly: false });
  const map = new Map();
  for (const p of processors) {
    const code = String(p.code || "").trim().toLowerCase();
    if (!code) continue;
    map.set(code, code);
    const short = String(p.shortCode || "").trim().toLowerCase();
    if (short) map.set(short, code);
  }
  return map;
}

function eventProcessorCode(row, labelToCode) {
  const label = parsePaymentProcessorLabelFromActivityBody(row.body);
  if (!label) return null;
  return labelToCode.get(String(label).toLowerCase()) || null;
}

async function loadPaymentChargeEvents({ fromDate, toDate, processor = null, withSale = false }) {
  const processorFilter = processor ? String(processor).trim().toLowerCase() : null;
  const labelToCode = await buildProcessorLabelToCode();

  const leadInclude = {
    model: db.Lead,
    as: "lead",
    attributes: withSale
      ? ["id", "customerId", "fullName", "phone", "leadPaymentChargeAmount", "createdByUserId"]
      : ["id", "leadPaymentChargeAmount"],
    required: true,
  };
  if (withSale) {
    leadInclude.include = [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username"],
        required: false,
      },
    ];
  }

  const events = await db.LeadUpdate.findAll({
    where: {
      type: { [Op.in]: [...PAYMENT_LEAD_UPDATE_TYPE_VALUES] },
      ...dateRangeWhere(fromDate, toDate),
    },
    attributes: ["id", "leadId", "type", "body", "createdAt"],
    include: [leadInclude],
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  const filtered = processorFilter
    ? events.filter((row) => eventProcessorCode(row, labelToCode) === processorFilter)
    : events;

  return { events: filtered, processorFilter, labelToCode };
}

/**
 * Aggregate latest payment outcomes from Leads (one row per sale).
 * Day expand still uses LeadUpdates via listPaymentChargeDayDetails.
 * @param {{ fromDate: string, toDate: string, processor?: string|null }} opts
 */
export async function aggregatePaymentChargeStats({ fromDate, toDate, processor = null }) {
  const processorFilter = processor ? String(processor).trim().toLowerCase() : null;

  const where = {
    leadPaymentChargeStatus: { [Op.in]: ["charged", "declined", "chargeback"] },
    leadPaymentOutcomeAt: { [Op.ne]: null },
    ...dateRangeWhereOn("leadPaymentOutcomeAt", fromDate, toDate),
  };
  if (processorFilter) {
    where.leadPaymentProcessor = processorFilter;
  }

  const leads = await db.Lead.findAll({
    where,
    attributes: [
      "id",
      "leadPaymentChargeStatus",
      "leadPaymentChargeAmount",
      "leadPaymentProcessor",
      "leadPaymentOutcomeAt",
    ],
  });

  const totals = emptyBucket();
  const byDayMap = new Map(eachDayInclusive(fromDate, toDate).map((d) => [d, emptyBucket()]));

  for (const lead of leads) {
    const status = lead.leadPaymentChargeStatus;
    if (!status) continue;
    const amount =
      lead.leadPaymentChargeAmount != null && Number.isFinite(Number(lead.leadPaymentChargeAmount))
        ? Number(lead.leadPaymentChargeAmount)
        : null;
    addEvent(totals, status, amount);
    const day = dayKeyFromDate(lead.leadPaymentOutcomeAt);
    if (day && byDayMap.has(day)) {
      addEvent(byDayMap.get(day), status, amount);
    } else if (day) {
      const bucket = emptyBucket();
      addEvent(bucket, status, amount);
      byDayMap.set(day, bucket);
    }
  }

  const byDay = [...byDayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, bucket]) => ({ date, ...finalizeBucket(bucket) }));

  return {
    fromDate,
    toDate,
    processor: processorFilter,
    totals: finalizeBucket(totals),
    byDay,
  };
}

/**
 * Detail rows for one calendar day (UTC date key), newest first.
 * @param {{ date: string, processor?: string|null }} opts
 */
export async function listPaymentChargeDayDetails({ date, processor = null }) {
  const { events, processorFilter, labelToCode } = await loadPaymentChargeEvents({
    fromDate: date,
    toDate: date,
    processor,
    withSale: true,
  });

  const leadIds = [...new Set(events.map((e) => e.leadId))];
  const amountTimeline = await loadAmountTimelines(leadIds);
  const processors = await listPaymentProcessors({ activeOnly: false });
  const byCode = Object.fromEntries(processors.map((p) => [p.code, p]));

  const details = events.map((row) => {
    const status = statusFromType(row.type);
    const amount = resolveEventAmount(row, amountTimeline, row.lead?.leadPaymentChargeAmount);
    const processorCode = eventProcessorCode(row, labelToCode);
    const processorMeta = processorCode ? byCode[processorCode] : null;
    const processorLabel =
      parsePaymentProcessorLabelFromActivityBody(row.body) ||
      processorMeta?.shortCode ||
      processorCode;
    return {
      id: row.id,
      createdAt: row.createdAt,
      status,
      amount: amount != null ? roundMoney(amount) : null,
      processor: processorCode,
      processorLabel,
      declineReason: status === "declined" ? parsePaymentDeclineReasonFromActivityBody(row.body) : null,
      sale: row.lead
        ? {
            leadId: row.lead.id,
            customerId: row.lead.customerId ?? null,
            fullName: row.lead.fullName || null,
            phone: row.lead.phone || null,
            agentUsername: row.lead.createdBy?.username || null,
          }
        : null,
    };
  });

  return {
    date,
    processor: processorFilter,
    events: details,
  };
}
