import { logCustomerStatus } from "@/server/calls/customerStatusLog";
import { emitToUser } from "@/server/socketHub";

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s || null;
}

/**
 * Push real Twilio PSTN (customer) leg status to the call owner over Socket.IO.
 * @param {{ id: number, userId: number }} call
 * @param {{ status: string, callSid?: string, durationSeconds?: number | null, source?: string }} detail
 */
export function emitCustomerCallStatus(call, detail) {
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

  const emitted = emitToUser(userId, "call:customer-status", payload);
  logCustomerStatus(emitted ? "socket.emit" : "socket.skip", {
    ...payload,
    userId,
    reason: emitted ? undefined : "Socket.IO not available (use npm run dev / server.js)",
  });
  return emitted;
}
