import { Op } from "sequelize";
import db from "@/server/db";
import {
  PAYMENT_LEAD_UPDATE_TYPE_VALUES,
  parseEmbeddedPaymentChargeAmount,
  parsePaymentAmountSetActivity,
  parsePaymentDeclineReasonFromActivityBody,
  parsePaymentProcessorCodeFromActivityBody,
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

/**
 * Resolve UI/API processor filter (code or shortCode) to canonical code + match aliases.
 * Aliases cover leads that may store either code or shortCode.
 */
async function resolveProcessorFilter(raw) {
  if (raw == null || raw === "") return { code: null, matchValues: null };
  const key = String(raw).trim().toLowerCase();
  if (!key || key === "all") return { code: null, matchValues: null };

  const processors = await listPaymentProcessors({ activeOnly: false });
  let row = processors.find((p) => String(p.code || "").trim().toLowerCase() === key);
  if (!row) {
    row = processors.find((p) => String(p.shortCode || "").trim().toLowerCase() === key);
  }
  if (!row) {
    row = processors.find((p) => String(p.fullName || "").trim().toLowerCase() === key);
  }
  if (!row) {
    return { code: key, matchValues: [key] };
  }
  const code = String(row.code || "").trim().toLowerCase();
  const short = String(row.shortCode || "").trim().toLowerCase();
  const full = String(row.fullName || "").trim().toLowerCase();
  const matchValues = [...new Set([code, short, full].filter(Boolean))];
  return { code, matchValues };
}

function eventProcessorCode(row, labelToCode) {
  const pcode = parsePaymentProcessorCodeFromActivityBody(row.body);
  if (pcode) return labelToCode.get(pcode) || pcode;
  const label = parsePaymentProcessorLabelFromActivityBody(row.body);
  if (!label) return null;
  const key = String(label).toLowerCase();
  // Keep raw label when not in registry so filters can still match shortCode text.
  return labelToCode.get(key) || key;
}

function leadStoredProcessorKey(lead, labelToCode) {
  const stored = String(lead?.leadPaymentProcessor || "")
    .trim()
    .toLowerCase();
  if (!stored) return null;
  return labelToCode.get(stored) || stored;
}

function eventMatchesProcessorFilter(row, labelToCode, matchValues) {
  if (!matchValues || matchValues.length === 0) return true;
  const set = new Set(matchValues);
  const fromEvent = eventProcessorCode(row, labelToCode);
  if (fromEvent && set.has(fromEvent)) return true;
  const label = parsePaymentProcessorLabelFromActivityBody(row.body);
  if (label && set.has(String(label).toLowerCase())) return true;
  const pcode = parsePaymentProcessorCodeFromActivityBody(row.body);
  if (pcode && (set.has(pcode) || set.has(labelToCode.get(pcode) || ""))) return true;
  const fromLead = leadStoredProcessorKey(row.lead, labelToCode);
  if (fromLead && set.has(fromLead)) return true;
  const leadRaw = String(row.lead?.leadPaymentProcessor || "")
    .trim()
    .toLowerCase();
  if (leadRaw && set.has(leadRaw)) return true;
  return false;
}

function chargeMatchesProcessor(row, matchValues) {
  if (!matchValues?.length) return true;
  const stored = String(row.processor || "").trim().toLowerCase();
  if (!stored) return false;
  return matchValues.includes(stored);
}

function applyRowsToBuckets(rows, totals, byDayMap, dateField = "createdAt") {
  for (const row of rows) {
    const status = row.status || row.leadPaymentChargeStatus;
    if (!status) continue;
    const rawAmount = row.amount ?? row.leadPaymentChargeAmount;
    const amount =
      rawAmount != null && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null;
    addEvent(totals, status, amount);
    const day = dayKeyFromDate(row[dateField] || row.leadPaymentOutcomeAt || row.createdAt);
    if (day && byDayMap.has(day)) {
      addEvent(byDayMap.get(day), status, amount);
    } else if (day) {
      const bucket = emptyBucket();
      addEvent(bucket, status, amount);
      byDayMap.set(day, bucket);
    }
  }
}

export function normalizePaymentKind(value) {
  const k = String(value || "all").trim().toLowerCase();
  if (k === "outside" || k === "lead") return k;
  return "all";
}

async function loadOutsideCustomerCharges({ fromDate, toDate, processor = null, withDetails = false }) {
  const { code: processorFilter, matchValues } = await resolveProcessorFilter(processor);
  const include = [
    {
      model: db.Customer,
      as: "customer",
      attributes: withDetails ? ["id", "fullName", "phone", "isOutside"] : ["id", "isOutside"],
      where: { isOutside: true },
      required: true,
    },
  ];
  if (withDetails) {
    include.push({
      model: db.User,
      as: "createdBy",
      attributes: ["id", "username"],
      required: false,
    });
  }

  const rows = await db.CustomerCharge.findAll({
    where: { ...dateRangeWhere(fromDate, toDate) },
    include,
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });
  const filtered = matchValues?.length
    ? rows.filter((row) => chargeMatchesProcessor(row, matchValues))
    : rows;
  return { rows: filtered, processorFilter };
}

/** Latest payment-log processor key per lead (for leads with missing leadPaymentProcessor). */
async function resolveProcessorsFromLatestLogs(leadIds, labelToCode) {
  const map = new Map();
  if (!leadIds.length) return map;

  const rows = await db.LeadUpdate.findAll({
    where: {
      leadId: { [Op.in]: leadIds },
      type: { [Op.in]: [...PAYMENT_LEAD_UPDATE_TYPE_VALUES] },
    },
    attributes: ["id", "leadId", "type", "body", "createdAt"],
    order: [
      ["leadId", "ASC"],
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  for (const row of rows) {
    if (map.has(row.leadId)) continue;
    const key = eventProcessorCode(row, labelToCode);
    if (key) map.set(row.leadId, key);
  }
  return map;
}

function leadMatchesProcessorFilter(lead, labelToCode, matchValues, logProcessorByLeadId) {
  if (!matchValues || matchValues.length === 0) return true;
  const set = new Set(matchValues);
  const stored = String(lead.leadPaymentProcessor || "")
    .trim()
    .toLowerCase();
  if (stored) {
    if (set.has(stored)) return true;
    const canonical = labelToCode.get(stored) || stored;
    if (set.has(canonical)) return true;
  }
  const fromLog = logProcessorByLeadId.get(lead.id);
  return Boolean(fromLog && set.has(fromLog));
}

async function loadPaymentChargeEvents({ fromDate, toDate, processor = null, withSale = false }) {
  const { code: processorFilter, matchValues } = await resolveProcessorFilter(processor);
  const labelToCode = await buildProcessorLabelToCode();

  const leadInclude = {
    model: db.Lead,
    as: "lead",
    attributes: withSale
      ? [
          "id",
          "customerId",
          "fullName",
          "phone",
          "leadPaymentChargeAmount",
          "leadPaymentProcessor",
          "createdByUserId",
        ]
      : ["id", "leadPaymentChargeAmount", "leadPaymentProcessor"],
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
    ? events.filter((row) => eventMatchesProcessorFilter(row, labelToCode, matchValues))
    : events;

  return { events: filtered, processorFilter, labelToCode, matchValues };
}

/**
 * Aggregate latest payment outcomes from Leads (one row per sale), plus outside
 * customer charges when kind is `all` or `outside`.
 * @param {{ fromDate: string, toDate: string, processor?: string|null, kind?: string }} opts
 */
export async function aggregatePaymentChargeStats({
  fromDate,
  toDate,
  processor = null,
  kind = "all",
}) {
  const paymentKind = normalizePaymentKind(kind);
  const { code: processorFilter, matchValues } = await resolveProcessorFilter(processor);
  const labelToCode = await buildProcessorLabelToCode();

  const totals = emptyBucket();
  const byDayMap = new Map(eachDayInclusive(fromDate, toDate).map((d) => [d, emptyBucket()]));

  if (paymentKind !== "outside") {
    const where = {
      leadPaymentChargeStatus: { [Op.in]: ["charged", "declined", "chargeback"] },
      leadPaymentOutcomeAt: { [Op.ne]: null },
      ...dateRangeWhereOn("leadPaymentOutcomeAt", fromDate, toDate),
    };

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

    let logProcessorByLeadId = new Map();
    if (matchValues?.length) {
      const missingProcessorLeadIds = leads
        .filter((lead) => !String(lead.leadPaymentProcessor || "").trim())
        .map((lead) => lead.id);
      logProcessorByLeadId = await resolveProcessorsFromLatestLogs(
        missingProcessorLeadIds,
        labelToCode,
      );
    }

    const filteredLeads = matchValues?.length
      ? leads.filter((lead) =>
          leadMatchesProcessorFilter(lead, labelToCode, matchValues, logProcessorByLeadId),
        )
      : leads;

    applyRowsToBuckets(filteredLeads, totals, byDayMap, "leadPaymentOutcomeAt");
  }

  if (paymentKind !== "lead") {
    const { rows } = await loadOutsideCustomerCharges({ fromDate, toDate, processor });
    applyRowsToBuckets(rows, totals, byDayMap, "createdAt");
  }

  const byDay = [...byDayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, bucket]) => ({ date, ...finalizeBucket(bucket) }));

  return {
    fromDate,
    toDate,
    processor: processorFilter,
    kind: paymentKind,
    totals: finalizeBucket(totals),
    byDay,
  };
}

/**
 * Detail rows for one calendar day (UTC date key), newest first.
 * @param {{ date: string, processor?: string|null, kind?: string }} opts
 */
export async function listPaymentChargeDayDetails({ date, processor = null, kind = "all" }) {
  const paymentKind = normalizePaymentKind(kind);
  const processors = await listPaymentProcessors({ activeOnly: false });
  const byCode = Object.fromEntries(processors.map((p) => [p.code, p]));
  const details = [];

  if (paymentKind !== "outside") {
    const { events, labelToCode } = await loadPaymentChargeEvents({
      fromDate: date,
      toDate: date,
      processor,
      withSale: true,
    });

    const leadIds = [...new Set(events.map((e) => e.leadId))];
    const amountTimeline = await loadAmountTimelines(leadIds);

    for (const row of events) {
      const status = statusFromType(row.type);
      const amount = resolveEventAmount(row, amountTimeline, row.lead?.leadPaymentChargeAmount);
      const processorCode = eventProcessorCode(row, labelToCode);
      const processorMeta = processorCode ? byCode[processorCode] : null;
      const processorLabel =
        parsePaymentProcessorLabelFromActivityBody(row.body) ||
        processorMeta?.shortCode ||
        processorCode;
      details.push({
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
              isOutside: false,
            }
          : null,
      });
    }
  }

  if (paymentKind !== "lead") {
    const { rows } = await loadOutsideCustomerCharges({
      fromDate: date,
      toDate: date,
      processor,
      withDetails: true,
    });
    for (const row of rows) {
      const processorCode = String(row.processor || "").trim().toLowerCase() || null;
      const processorMeta = processorCode ? byCode[processorCode] : null;
      details.push({
        id: `outside-${row.id}`,
        createdAt: row.createdAt,
        status: row.status,
        amount: row.amount != null ? roundMoney(Number(row.amount)) : null,
        processor: processorCode,
        processorLabel: processorMeta?.shortCode || processorCode,
        declineReason: row.status === "declined" ? row.declineReason || null : null,
        sale: {
          leadId: null,
          customerId: row.customerId,
          fullName: row.customer?.fullName || null,
          phone: row.customer?.phone || null,
          agentUsername: row.createdBy?.username || null,
          isOutside: true,
        },
      });
    }
  }

  details.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  const { code: processorFilter } = await resolveProcessorFilter(processor);
  return {
    date,
    processor: processorFilter,
    kind: paymentKind,
    events: details,
  };
}
