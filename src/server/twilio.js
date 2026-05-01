import twilio from "twilio";

function requireVar(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getTwilioClient() {
  const isTestMode =
    process.env.NODE_ENV === "development" || process.env.TWILIO_TEST_MODE === "true";

  const accountSid = isTestMode
    ? process.env.TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID
    : process.env.TWILIO_ACCOUNT_SID;
  const authToken = isTestMode
    ? process.env.TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN
    : process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }
  return twilio(accountSid, authToken);
}

export function getTwilioFromNumber(fallback) {
  return (
    fallback ||
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    requireVar("TWILIO_PHONE_NUMBER")
  );
}

function getWebhookBaseUrl() {
  const baseUrl =
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.RAILWAY_STATIC_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "";

  if (!baseUrl) return null;
  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

export function getTwilioCallCreateParams() {
  const appSid = process.env.TWILIO_APP_SID;
  if (appSid) {
    return { applicationSid: appSid };
  }

  const twimlUrl = process.env.TWILIO_TWIML_URL;
  if (twimlUrl) {
    return { url: twimlUrl };
  }

  const webhookBaseUrl = getWebhookBaseUrl();
  if (webhookBaseUrl) {
    return { url: `${webhookBaseUrl}/api/twilio/voice` };
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

