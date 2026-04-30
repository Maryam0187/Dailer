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

