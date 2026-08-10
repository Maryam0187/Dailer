import db from "@/server/db";
import { lookupIvrCustomers } from "@/server/ivr/lookupIvrCustomers";

function serialize(row, customers = null) {
  if (!row) return null;
  return {
    id: row.id,
    callSid: row.callSid || null,
    lastEventType: row.lastEventType,
    step: row.step || null,
    fromNumber: row.fromNumber || null,
    toNumber: row.toNumber || null,
    choice: row.choice || null,
    associate: row.associate || null,
    numberEntered: row.numberEntered || null,
    customer: customers?.customer || null,
    associateCustomer: customers?.associateCustomer || null,
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/**
 * Upsert IVR notification log by callSid (or create a new row when callSid missing).
 */
export async function persistIvrNotification(payload) {
  const callSid = String(payload?.callSid || "").trim() || null;
  const lastEventType = String(payload?.type || "incoming").trim() || "incoming";
  const step = payload?.step != null ? String(payload.step).trim() || null : null;
  const fromNumber = payload?.from != null ? String(payload.from).trim() || null : null;
  const toNumber = payload?.to != null ? String(payload.to).trim() || null : null;
  const choice = payload?.choice != null ? String(payload.choice).trim() || null : null;
  const associate = payload?.associate != null ? String(payload.associate).trim() || null : null;
  const numberEntered = payload?.number != null ? String(payload.number).trim() || null : null;

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
          associate: associate || existing.associate,
          numberEntered: numberEntered || existing.numberEntered,
          readAt: null, // new activity marks unread again
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
        associate,
        numberEntered,
        readAt: null,
      });
    }

    const customers = await lookupIvrCustomers({
      from: row.fromNumber,
      number: row.numberEntered,
    });
    return serialize(row, customers);
  } catch (err) {
    console.warn("[ivr/persistIvrNotification]", err?.message || err);
    return null;
  }
}

export async function serializeIvrNotificationWithCustomers(row) {
  if (!row) return null;
  const customers = await lookupIvrCustomers({
    from: row.fromNumber,
    number: row.numberEntered,
  });
  return serialize(row, customers);
}

export { serialize as serializeIvrNotification };
