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

/** Safe copy for agents/managers — no Twilio codes or JWT wording. */
export const GENERIC_VOICE_DEVICE_ERROR =
  "Voice connection issue. Check your network.";

const SIGNALING_ERROR_CODES = new Set([
  20101, // invalid access token
  31005, // websocket closed unexpectedly
  31009, // no transport
  31204, // Twilio Client version not supported
  // 31205 JWT expired — recoverable via device.updateToken; not fatal by itself
  53000, // signaling connection error
]);

/**
 * Access-token / JWT expiry (Twilio 31205). Prefer updateToken over destroy.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTwilioVoiceAccessTokenExpiredError(err) {
  const code = Number(err?.code ?? err?.twilioError?.code);
  if (code === 31205) return true;

  const message = String(err?.message || err?.twilioError?.message || "").toLowerCase();
  return (
    message.includes("jwt token expired") ||
    message.includes("access token expired") ||
    message.includes("token expired")
  );
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isFatalTwilioVoiceDeviceError(err) {
  if (isTwilioVoiceAccessTokenExpiredError(err)) return false;

  const code = Number(err?.code ?? err?.twilioError?.code);
  if (Number.isFinite(code) && SIGNALING_ERROR_CODES.has(code)) return true;

  const message = String(err?.message || err?.twilioError?.message || "").toLowerCase();
  return (
    message.includes("authentication failed") ||
    message.includes("token is invalid") ||
    message.includes("registration timed out")
  );
}

/**
 * Human-readable status for dialer UI.
 * Non-admins get a generic message (no Twilio codes / JWT detail).
 * @param {unknown} err
 * @param {{ isAdmin?: boolean }} [options]
 * @returns {string}
 */
export function formatTwilioVoiceDeviceError(err, options = {}) {
  const isAdmin = Boolean(options?.isAdmin);
  if (!isAdmin) return GENERIC_VOICE_DEVICE_ERROR;

  const code = Number(err?.code ?? err?.twilioError?.code);
  const raw = String(err?.message || err?.twilioError?.message || "").trim();
  if (code === 31205 || isTwilioVoiceAccessTokenExpiredError(err)) {
    return "Voice access token expired (31205). Refreshing or retry Voice.";
  }
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
 * Fetch a fresh Voice JWT from the app token API.
 * @param {string} [path]
 * @returns {Promise<{ token: string, identity: string|null }>}
 */
export async function fetchTwilioVoiceAccessToken(path = "/api/twilio/token") {
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  if (res.status === 503) {
    throw new Error("Twilio browser agent is not configured");
  }
  if (res.status === 403 && path.includes("token-line2")) {
    throw new Error("Second dialer is not enabled for this account");
  }
  if (!res.ok) {
    throw new Error(`Failed to create Twilio voice token (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const token = data?.token;
  if (!token) throw new Error("Missing Twilio voice token");
  return { token, identity: data?.identity || null };
}

/**
 * Apply a new JWT to an existing Device (no destroy).
 * @param {import("@twilio/voice-sdk").Device} device
 * @param {string} token
 */
export function updateTwilioVoiceDeviceToken(device, token) {
  if (!device || !token) throw new Error("Device and token are required");
  if (typeof device.updateToken !== "function") {
    throw new Error("Twilio Device.updateToken is not available");
  }
  device.updateToken(token);
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
