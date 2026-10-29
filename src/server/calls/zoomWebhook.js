import crypto from "crypto";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

/** Zoom Phone events that mean an inbound call to our side (callee). */
export const ZOOM_INBOUND_NOTIFY_EVENTS = new Set([
  "phone.callee_ringing",
  "phone.callee_missed",
  "phone.callee_answered",
]);

export function zoomWebhookSecret() {
  return String(process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "").trim();
}

export function buildZoomCrcResponse(plainToken, secret) {
  const token = String(plainToken || "");
  const encryptedToken = crypto.createHmac("sha256", secret).update(token).digest("hex");
  return { plainToken: token, encryptedToken };
}

/**
 * Verify Zoom webhook signature (x-zm-signature) against the raw request body.
 * @see https://developers.zoom.us/docs/api/webhooks/#verify-webhook-events
 */
export function verifyZoomWebhookSignature({ rawBody, signature, timestamp, secret }) {
  if (!secret || !signature || timestamp == null || timestamp === "") return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const hash = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const expected = `v0=${hash}`;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function partyPhone(party) {
  if (!party || typeof party !== "object") return null;
  const raw = party.phone_number || party.phoneNumber || null;
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || /^anonymous$/i.test(s)) return null;
  return normalizeToE164(s) || s.slice(0, 32) || null;
}

/** External-ish caller (skip short internal extensions). */
export function isNotifyableInboundFrom(from) {
  if (!from) return false;
  const digits = String(from).replace(/\D/g, "");
  return digits.length >= 10;
}

/**
 * Extract call_id / from / to from a Zoom Phone webhook payload.object.
 */
export function extractZoomWebhookInbound(object) {
  const obj = object && typeof object === "object" ? object : {};
  const callId = obj.call_id != null ? String(obj.call_id).trim() : "";
  const from = partyPhone(obj.caller);
  const to = partyPhone(obj.callee);
  return {
    callId: callId || null,
    from,
    to,
  };
}
