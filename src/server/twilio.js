import twilio from "twilio";
import { resolveMainTwilioCredentials } from "@/server/twilio/mainSettings";

function requireVar(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Main-account Twilio REST client.
 * Prefers admin-saved DB credentials (`TwilioMainSettings`), then env.
 */
export async function getTwilioClient() {
  const creds = await resolveMainTwilioCredentials();
  if (!creds.accountSid || !creds.authToken) {
    throw new Error(
      "Twilio credentials not configured. Set them in Admin → Twilio numbers, or set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }
  return twilio(creds.accountSid, creds.authToken);
}

/** @deprecated Prefer await getTwilioFromNumber — kept name; now async. */
export async function getTwilioFromNumber(fallback) {
  if (fallback) return fallback;
  const creds = await resolveMainTwilioCredentials();
  return (
    creds.phoneNumber ||
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    requireVar("TWILIO_PHONE_NUMBER")
  );
}

/** Sidecar Line 2 caller ID. Does not fall back to Line 1. */
export async function getTwilioLine2FromNumber() {
  const creds = await resolveMainTwilioCredentials();
  const value = String(creds.phoneNumber2 || process.env.TWILIO_PHONE_NUMBER_2 || "").trim();
  if (!value) {
    throw new Error(
      "Line 2 Twilio number is required. Set phoneNumber2 in Admin → Twilio numbers, or TWILIO_PHONE_NUMBER_2.",
    );
  }
  return value;
}

/** Account SID for Basic auth (recordings, etc.). */
export async function getTwilioAccountSid() {
  const creds = await resolveMainTwilioCredentials();
  if (!creds.accountSid) {
    throw new Error("Twilio account SID not configured");
  }
  return creds.accountSid;
}

export async function getTwilioAuthToken() {
  const creds = await resolveMainTwilioCredentials();
  if (!creds.authToken) {
    throw new Error("Twilio auth token not configured");
  }
  return creds.authToken;
}

function getWebhookBaseUrl(fallbackBaseUrl) {
  const baseUrl =
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.RAILWAY_STATIC_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    fallbackBaseUrl ||
    "";

  if (!baseUrl) return null;
  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.fallbackBaseUrl]
 * @param {number|string} [opts.agentUserId] – Appended as `?agentUserId=` on the voice URL so TwiML dials that agent's Twilio Client.
 */
export function getTwilioCallCreateParams({ fallbackBaseUrl, agentUserId } = {}) {
  const appSid = process.env.TWILIO_APP_SID;
  if (appSid) {
    return { applicationSid: appSid };
  }

  const webhookBaseUrl = getWebhookBaseUrl(fallbackBaseUrl);
  if (webhookBaseUrl) {
    const qs =
      agentUserId != null && agentUserId !== ""
        ? `?${new URLSearchParams({ agentUserId: String(agentUserId) })}`
        : "";
    return { url: `${webhookBaseUrl}/api/twilio/voice${qs}` };
  }

  const twimlUrl = process.env.TWILIO_TWIML_URL;
  if (twimlUrl) {
    return { url: twimlUrl };
  }

  throw new Error(
    "Twilio call flow not configured. Set TWILIO_APP_SID or TWILIO_TWIML_URL or TWILIO_WEBHOOK_BASE_URL.",
  );
}

export function getTwilioStatusCallbackParams() {
  const callbackUrl =
    process.env.TWILIO_STATUS_CALLBACK_URL || (() => {
      const webhookBaseUrl = getWebhookBaseUrl();
      return webhookBaseUrl ? `${webhookBaseUrl}/api/twilio/status` : null;
    })();
  if (!callbackUrl) return {};

  return {
    statusCallback: callbackUrl,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  };
}

export function getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl } = {}) {
  const callbackUrl =
    process.env.TWILIO_STATUS_CALLBACK_URL || (() => {
      const webhookBaseUrl = getWebhookBaseUrl(fallbackBaseUrl);
      return webhookBaseUrl ? `${webhookBaseUrl}/api/twilio/status` : null;
    })();
  if (!callbackUrl) return {};

  return {
    statusCallback: callbackUrl,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  };
}
