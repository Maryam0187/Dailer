import { Op } from "sequelize";
import db from "@/server/db";
import { phoneVariants } from "@/server/ivr/phoneVariants";

const CALL_LOG_WINDOW_MS = 48 * 60 * 60 * 1000;
const CALL_LOG_ROW_LIMIT = 20;
const CALL_LOG_AGENT_CAP = 5;

function uniqPositiveIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function findCallLogAgents(from) {
  const variants = phoneVariants(from);
  if (!variants.length) {
    return { callLogUserIds: [], relatedCallLogs: [] };
  }

  const since = new Date(Date.now() - CALL_LOG_WINDOW_MS);
  let rows = [];
  try {
    rows = await db.CallLog.findAll({
      where: {
        direction: "outbound",
        createdAt: { [Op.gte]: since },
        toNumber: { [Op.in]: variants },
      },
      attributes: ["id", "userId", "toNumber", "fromNumber", "status", "createdAt", "durationSeconds"],
      order: [["createdAt", "DESC"]],
      limit: CALL_LOG_ROW_LIMIT,
    });
  } catch (err) {
    console.warn("[ivr/resolveInbound] callLog", err?.message || err);
    return { callLogUserIds: [], relatedCallLogs: [] };
  }

  const callLogUserIds = [];
  const seen = new Set();
  for (const row of rows) {
    const uid = Number(row.userId);
    if (!Number.isInteger(uid) || uid <= 0 || seen.has(uid)) continue;
    seen.add(uid);
    callLogUserIds.push(uid);
    if (callLogUserIds.length >= CALL_LOG_AGENT_CAP) break;
  }

  const relatedCallLogs = rows.slice(0, CALL_LOG_ROW_LIMIT).map((row) => ({
    id: row.id,
    userId: row.userId,
    toNumber: row.toNumber || null,
    fromNumber: row.fromNumber || null,
    status: row.status || null,
    durationSeconds: row.durationSeconds ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  }));

  return { callLogUserIds, relatedCallLogs };
}

/**
 * Exact phone match only (Customer then Lead) — no suffix LIKE (CPU-safe).
 */
async function findLeadExact(from) {
  const variants = phoneVariants(from);
  if (!variants.length) {
    return { leadInSystem: false, lastSale: null, leadUserIds: [] };
  }

  try {
    const customer = await db.Customer.findOne({
      where: { phone: { [Op.in]: variants } },
      attributes: ["id", "phone", "fullName", "isOutside"],
      order: [
        ["isOutside", "ASC"],
        ["id", "ASC"],
      ],
    });

    let lead = null;
    if (customer?.id && !customer.isOutside) {
      lead = await db.Lead.findOne({
        where: { customerId: customer.id },
        attributes: [
          "id",
          "fullName",
          "phone",
          "status",
          "createdAt",
          "assignedUserId",
          "createdByUserId",
        ],
        order: [["createdAt", "DESC"]],
      });
    }

    if (!lead) {
      lead = await db.Lead.findOne({
        where: { phone: { [Op.in]: variants } },
        attributes: [
          "id",
          "fullName",
          "phone",
          "status",
          "createdAt",
          "assignedUserId",
          "createdByUserId",
          "customerId",
        ],
        order: [["createdAt", "DESC"]],
      });
    }

    if (!lead?.id) {
      const customerPayload = customer
        ? {
            id: customer.id,
            phone: customer.phone || null,
            fullName: customer.fullName || null,
            isOutside: Boolean(customer.isOutside),
            lastSale: null,
          }
        : null;
      return {
        leadInSystem: false,
        callerInSystem: Boolean(customerPayload),
        lastSale: null,
        leadUserIds: [],
        customer: customerPayload,
      };
    }

    const lastSale = {
      id: lead.id,
      fullName: lead.fullName || null,
      phone: lead.phone || null,
      status: lead.status || null,
      createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString() : null,
      assignedUserId: lead.assignedUserId || null,
      createdByUserId: lead.createdByUserId || null,
    };

    return {
      leadInSystem: true,
      callerInSystem: true,
      lastSale,
      leadUserIds: uniqPositiveIds([lead.assignedUserId, lead.createdByUserId]),
      customer: customer
        ? {
            id: customer.id,
            phone: customer.phone || null,
            fullName: customer.fullName || null,
            isOutside: Boolean(customer.isOutside),
            lastSale,
          }
        : {
            id: null,
            phone: lead.phone || null,
            fullName: lead.fullName || null,
            isOutside: false,
            lastSale,
          },
    };
  } catch (err) {
    console.warn("[ivr/resolveInbound] lead", err?.message || err);
    return {
      leadInSystem: false,
      callerInSystem: false,
      lastSale: null,
      leadUserIds: [],
      customer: null,
    };
  }
}

/**
 * Resolve who gets inbound notify (agents only — admins merged in notifier).
 * Call logs (48h) win for agent targets; lead owners only when no call-log agents.
 * If call-log agents + lead exists → messageMode ask_admin (do not notify lead owners).
 */
export async function resolveInboundNotifyTargets({ from } = {}) {
  const { callLogUserIds, relatedCallLogs } = await findCallLogAgents(from);
  const lead = await findLeadExact(from);

  const hasCallLogAgents = callLogUserIds.length > 0;
  const agentNotifyUserIds = hasCallLogAgents
    ? callLogUserIds
    : lead.leadUserIds || [];

  // Caller/lead already in CRM → call-log agents must ask admin (do not expose others' lead).
  const callerInSystem = Boolean(lead.callerInSystem || lead.leadInSystem);

  let notifySource = "none";
  let messageMode = "incoming";
  if (hasCallLogAgents && callerInSystem) {
    notifySource = "call_log";
    messageMode = "ask_admin";
  } else if (hasCallLogAgents) {
    notifySource = "call_log";
    messageMode = "callback";
  } else if (lead.leadInSystem) {
    notifySource = "lead";
    messageMode = "lead_callback";
  }

  return {
    agentNotifyUserIds: uniqPositiveIds(agentNotifyUserIds),
    callLogUserIds,
    leadUserIds: lead.leadUserIds || [],
    leadInSystem: Boolean(lead.leadInSystem),
    callerInSystem,
    lastSale: lead.lastSale || null,
    customer: lead.customer || null,
    relatedCallLogs,
    notifySource,
    messageMode,
  };
}
