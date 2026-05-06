import twilio from "twilio";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

/** Lowercase slug safe for Twilio Client names: letters, digits, hyphens. */
function slugifyAgentName(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s.slice(0, 64) : "user";
}

/**
 * Twilio Voice Client identity: `{id}-{name}` (e.g. `3-maryam`).
 * Must match TwiML &lt;Client&gt; and the JWT from /api/twilio/token.
 * @param {number|string} userId
 * @param {string} [username] – display/login name; falls back to `user` if empty
 */
export function getAgentClientIdentity(userId, username) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw new Error("userId must be a positive integer");
  }
  const name = slugifyAgentName(username);
  return `${id}-${name}`;
}

export function isTwilioBrowserAgentConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_API_KEY_SID &&
      process.env.TWILIO_API_KEY_SECRET,
  );
}

/**
 * JWT for Twilio Voice JS SDK (`@twilio/voice-sdk`). Requires API Key (create in Twilio Console).
 * @param {string} identity – Twilio Client name (e.g. from {@link getAgentClientIdentity}).
 */
export function createVoiceAccessToken(identity) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    throw new Error(
      "Browser agent voice token requires TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET.",
    );
  }
  if (!identity || typeof identity !== "string") {
    throw new Error("identity is required for the voice access token.");
  }

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });
  const grant = new VoiceGrant({ incomingAllow: true });
  token.addGrant(grant);
  return { token: token.toJwt(), identity };
}
