import twilio from "twilio";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

export function isTwilioBrowserAgentConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_API_KEY_SID &&
      process.env.TWILIO_API_KEY_SECRET &&
      process.env.TWILIO_AGENT_CLIENT_IDENTITY?.trim(),
  );
}

/**
 * JWT for Twilio Voice JS SDK (`@twilio/voice-sdk`). Requires API Key (create in Twilio Console).
 */
export function createVoiceAccessToken() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const identity = process.env.TWILIO_AGENT_CLIENT_IDENTITY?.trim();

  if (!accountSid || !apiKeySid || !apiKeySecret || !identity) {
    throw new Error(
      "Browser agent voice token requires TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_AGENT_CLIENT_IDENTITY.",
    );
  }

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });
  const grant = new VoiceGrant({ incomingAllow: true });
  token.addGrant(grant);
  return { token: token.toJwt(), identity };
}
