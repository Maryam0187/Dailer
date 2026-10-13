import twilio from "twilio";
import { getTeamTwilioContext } from "@/server/twilioTeam";
import { resolveMainTwilioCredentials } from "@/server/twilio/mainSettings";

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

/** Second outbound Device identity. Must not match Line 1. */
export function getAgentClientIdentityLine2(userId, username) {
  return `${getAgentClientIdentity(userId, username)}-2`;
}

export async function isTwilioBrowserAgentConfigured() {
  const creds = await resolveMainTwilioCredentials();
  return Boolean(creds.accountSid && creds.apiKeySid && creds.apiKeySecret);
}

/**
 * Whether Voice JWT can be issued for this user (main keys or team subaccount API keys).
 * @param {object} user
 */
export async function isTwilioBrowserAgentConfiguredForUser(user) {
  const ctx = await getTeamTwilioContext(user);
  if (ctx.mode === "team") {
    return Boolean(ctx.accountSid && ctx.apiKeySid && ctx.apiKeySecret);
  }
  return await isTwilioBrowserAgentConfigured();
}

function buildVoiceAccessToken({ accountSid, apiKeySid, apiKeySecret, identity }) {
  if (!accountSid || !apiKeySid || !apiKeySecret) {
    throw new Error(
      "Browser agent voice token requires account SID, API key SID, and API key secret.",
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

/**
 * JWT for Twilio Voice JS SDK — main account (DB settings or env).
 * @param {string} identity
 */
export async function createVoiceAccessToken(identity) {
  const creds = await resolveMainTwilioCredentials();
  return buildVoiceAccessToken({
    accountSid: creds.accountSid,
    apiKeySid: creds.apiKeySid,
    apiKeySecret: creds.apiKeySecret,
    identity,
  });
}

/**
 * Voice JWT for a user: team subaccount API keys when configured, else main account.
 * @param {object} user
 * @param {string} identity
 */
export async function createVoiceAccessTokenForUser(user, identity) {
  const ctx = await getTeamTwilioContext(user);
  if (ctx.mode === "team") {
    return buildVoiceAccessToken({
      accountSid: ctx.accountSid,
      apiKeySid: ctx.apiKeySid,
      apiKeySecret: ctx.apiKeySecret,
      identity,
    });
  }
  return await createVoiceAccessToken(identity);
}
