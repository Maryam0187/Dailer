/**
 * Shared Twilio Voice JS Device helpers.
 * Destroy Device only on hard auth/signaling failures — not on normal reconnects.
 */

/**
 * Confirmed 2026-10-17: singapore edge failed for agents (53000 / WS 1005 loops);
 * ashburn works. Prefer ashburn; fall back to roaming if ashburn is unreachable.
 * Do not put singapore first.
 */
export const TWILIO_VOICE_EDGE_FALLBACK = ["ashburn", "roaming"];

export const TWILIO_VOICE_DEVICE_OPTIONS = {
  edge: TWILIO_VOICE_EDGE_FALLBACK,
  // Twilio-recommended: allow up to 30s to rejoin the same edge mid-call / after a blip.
  // A 3s value caused ready → brief reconnect → our flap killer → Retry Voice loops.
  maxCallSignalingTimeoutMs: 30000,
};

const SIGNALING_ERROR_CODES = new Set([
  20101, // invalid access token
  31005, // websocket closed unexpectedly
  31009, // no transport
  31204, // Twilio Client version not supported
  31205, // JWT expired
  53000, // signaling connection error
]);

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isFatalTwilioVoiceDeviceError(err) {
  const code = Number(err?.code ?? err?.twilioError?.code);
  if (Number.isFinite(code) && SIGNALING_ERROR_CODES.has(code)) return true;

  const message = String(err?.message || err?.twilioError?.message || "").toLowerCase();
  return (
    message.includes("jwt token expired") ||
    message.includes("access token expired") ||
    message.includes("authentication failed") ||
    message.includes("token is invalid") ||
    message.includes("registration timed out")
  );
}

/**
 * Human-readable status for dialer UI.
 * @param {unknown} err
 * @returns {string}
 */
export function formatTwilioVoiceDeviceError(err) {
  const code = Number(err?.code ?? err?.twilioError?.code);
  const raw = String(err?.message || err?.twilioError?.message || "").trim();
  if (code === 53000 || /signaling connection/i.test(raw)) {
    return "Voice signaling disconnected (53000). Check network, then retry.";
  }
  if (code === 31005) {
    return "Voice websocket closed unexpectedly. Check network, then retry.";
  }
  if (/registration timed out/i.test(raw)) {
    return "Voice registration timed out. Signaling could not stay connected — retry.";
  }
  return raw || "Twilio Voice Device error";
}

/**
 * Exponential backoff between Device recreate attempts (ms).
 * @param {number} failureCount
 * @returns {number}
 */
export function twilioVoiceRegisterBackoffMs(failureCount) {
  const n = Math.max(0, Number(failureCount) || 0);
  const base = 5000;
  const capped = Math.min(60000, base * 2 ** Math.min(n, 4));
  return capped;
}

/**
 * Safely destroy a Device that failed mid-register so WSTransport cannot
 * keep opening signaling sockets forever.
 * @param {import("@twilio/voice-sdk").Device | null | undefined} device
 */
export function destroyTwilioVoiceDevice(device) {
  if (!device) return;
  try {
    device.destroy();
  } catch {
    /* ignore */
  }
}
