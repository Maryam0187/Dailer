import { logCustomerStatus } from "@/server/calls/customerStatusLog";
import { emitToUser } from "@/server/socketHub";

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s || null;
}

/**
 * Log customer leg status on the server and push to the browser console via Socket.IO.
 * Does not change call UI state — console listener only.
 */
export function notifyCustomerCallStatus(call, detail) {
  const status = normalizeStatus(detail?.status);
  const callId = Number(call?.id);
  const userId = Number(call?.userId);
  if (!status || !Number.isInteger(callId) || callId <= 0) return false;
  if (!Number.isInteger(userId) || userId <= 0) return false;

  const payload = {
    callId,
    status,
    callSid: detail?.callSid ? String(detail.callSid).trim() : null,
    durationSeconds:
      detail?.durationSeconds != null && Number.isFinite(Number(detail.durationSeconds))
        ? Math.floor(Number(detail.durationSeconds))
        : null,
    source: detail?.source ? String(detail.source) : null,
    at: new Date().toISOString(),
  };

  logCustomerStatus(detail?.source || "customer", {
    ...payload,
    userId,
    callStatus: status,
  });

  return emitToUser(userId, "call:customer-status", payload);
}
