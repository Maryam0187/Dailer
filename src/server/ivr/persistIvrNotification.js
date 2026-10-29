import db from "@/server/db";
import { lookupIvrCustomers } from "@/server/ivr/lookupIvrCustomers";

function serialize(row, customers = null, extra = {}) {
  if (!row) return null;
  const recipientReadAt = extra.recipientReadAt;
  return {
    id: row.id,
    callSid: row.callSid || null,
    lastEventType: row.lastEventType,
    step: row.step || null,
    fromNumber: row.fromNumber || null,
    toNumber: row.toNumber || null,
    choice: row.choice || null,
    leadInSystem: Boolean(row.leadInSystem),
    notifySource: row.notifySource || null,
    messageMode: row.messageMode || null,
    customer: customers?.customer || customers?.customers?.[0] || extra.customer || null,
    customers: Array.isArray(customers?.customers)
      ? customers.customers
      : customers?.customer
        ? [customers.customer]
        : extra.customer
          ? [extra.customer]
          : [],
    lastSale: extra.lastSale || customers?.customer?.lastSale || null,
    relatedCallLogs: Array.isArray(extra.relatedCallLogs) ? extra.relatedCallLogs : [],
    readAt:
      recipientReadAt !== undefined
        ? recipientReadAt
          ? new Date(recipientReadAt).toISOString()
          : null
        : row.readAt
          ? new Date(row.readAt).toISOString()
          : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

async function upsertRecipients(notificationId, userIds) {
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!notificationId || !ids.length) return;

  const now = new Date();
  for (const userId of ids) {
    try {
      const [row, created] = await db.IvrNotificationRecipient.findOrCreate({
        where: { notificationId, userId },
        defaults: { notificationId, userId, readAt: null },
      });
      if (!created && row.readAt) {
        await row.update({ readAt: null, updatedAt: now });
      }
    } catch (err) {
      console.warn("[ivr/persist] recipient", userId, err?.message || err);
    }
  }
}

/**
 * Upsert IVR notification log by callSid (or create a new row when callSid missing).
 * @param {object} payload
 * @param {{ skipCustomerLookup?: boolean, customer?: object|null, lastSale?: object|null, relatedCallLogs?: array, recipientUserIds?: number[] }} opts
 */
export async function persistIvrNotification(payload, opts = {}) {
  const callSid = String(payload?.callSid || "").trim() || null;
  const lastEventType = String(payload?.type || "incoming").trim() || "incoming";
  const step = payload?.step != null ? String(payload.step).trim() || null : null;
  const fromNumber = payload?.from != null ? String(payload.from).trim() || null : null;
  const toNumber = payload?.to != null ? String(payload.to).trim() || null : null;
  const choice = payload?.choice != null ? String(payload.choice).trim() || null : null;
  const leadInSystem = Boolean(payload?.leadInSystem);
  const notifySource = payload?.notifySource != null ? String(payload.notifySource).trim() || null : null;
  const messageMode = payload?.messageMode != null ? String(payload.messageMode).trim() || null : null;

  try {
    let row = null;
    if (callSid) {
      const existing = await db.IvrNotification.findOne({ where: { callSid } });
      if (existing) {
        await existing.update({
          lastEventType,
          step: step ?? existing.step,
          fromNumber: fromNumber || existing.fromNumber,
          toNumber: toNumber || existing.toNumber,
          choice: choice || existing.choice,
          leadInSystem,
          notifySource: notifySource ?? existing.notifySource,
          messageMode: messageMode ?? existing.messageMode,
          readAt: null,
        });
        row = existing;
      }
    }

    if (!row) {
      row = await db.IvrNotification.create({
        callSid,
        lastEventType,
        step,
        fromNumber,
        toNumber,
        choice,
        leadInSystem,
        notifySource,
        messageMode,
        readAt: null,
      });
    }

    if (Array.isArray(opts.recipientUserIds) && opts.recipientUserIds.length) {
      await upsertRecipients(row.id, opts.recipientUserIds);
    }

    let customers = null;
    if (!opts.skipCustomerLookup) {
      customers = await lookupIvrCustomers({ from: row.fromNumber });
    } else if (opts.customer) {
      customers = {
        customer: opts.customer,
        customers: [opts.customer],
      };
    }

    return serialize(row, customers, {
      customer: opts.customer || null,
      lastSale: opts.lastSale || null,
      relatedCallLogs: opts.relatedCallLogs || [],
    });
  } catch (err) {
    console.warn("[ivr/persistIvrNotification]", err?.message || err);
    return null;
  }
}

export async function serializeIvrNotificationWithCustomers(row, extra = {}) {
  if (!row) return null;
  const customers = await lookupIvrCustomers({ from: row.fromNumber });
  return serialize(row, customers, extra);
}

export { serialize as serializeIvrNotification, upsertRecipients };
