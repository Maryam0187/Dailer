import db from "@/server/db";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

function maskSecret(value) {
  const s = String(value || "");
  if (!s) return null;
  if (s.length <= 4) return "****";
  return `****${s.slice(-4)}`;
}

function envMainCredentials() {
  const isTestMode =
    process.env.NODE_ENV === "development" || process.env.TWILIO_TEST_MODE === "true";
  const accountSid = String(
    (isTestMode
      ? process.env.TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID
      : process.env.TWILIO_ACCOUNT_SID) || "",
  ).trim();
  const authToken = String(
    (isTestMode
      ? process.env.TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN
      : process.env.TWILIO_AUTH_TOKEN) || "",
  ).trim();
  return {
    source: "env",
    accountSid,
    authToken,
    apiKeySid: String(process.env.TWILIO_API_KEY_SID || "").trim() || null,
    apiKeySecret: String(process.env.TWILIO_API_KEY_SECRET || "").trim() || null,
    phoneNumber:
      String(process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "").trim() ||
      null,
    phoneNumber2: String(process.env.TWILIO_PHONE_NUMBER_2 || "").trim() || null,
  };
}

function rowToCredentials(row) {
  return {
    source: "db",
    accountSid: String(row.accountSid || "").trim(),
    authToken: String(row.authToken || "").trim(),
    apiKeySid: String(row.apiKeySid || "").trim() || null,
    apiKeySecret: String(row.apiKeySecret || "").trim() || null,
    phoneNumber: row.phoneNumber ? String(row.phoneNumber).trim() : null,
    phoneNumber2: row.phoneNumber2 ? String(row.phoneNumber2).trim() : null,
  };
}

/** Latest DB settings row, or null. */
export async function findTwilioMainSettingRow() {
  return db.TwilioMainSetting.findOne({ order: [["id", "DESC"]] });
}

/**
 * Prefer admin-saved DB credentials; fall back to env.
 * @returns {Promise<{ source: string, accountSid: string, authToken: string, apiKeySid: string | null, apiKeySecret: string | null, phoneNumber: string | null, phoneNumber2: string | null }>}
 */
export async function resolveMainTwilioCredentials() {
  const row = await findTwilioMainSettingRow();
  if (row && String(row.accountSid || "").trim() && String(row.authToken || "").trim()) {
    return rowToCredentials(row);
  }
  return envMainCredentials();
}

export function serializeTwilioMainSettings(row) {
  if (!row) {
    const env = envMainCredentials();
    return {
      configured: Boolean(env.accountSid && env.authToken),
      source: env.accountSid && env.authToken ? "env" : null,
      accountSid: env.accountSid || "",
      authTokenMasked: maskSecret(env.authToken),
      apiKeySid: env.apiKeySid || "",
      apiKeySecretMasked: maskSecret(env.apiKeySecret),
      phoneNumber: env.phoneNumber,
      phoneNumber2: env.phoneNumber2,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    configured: true,
    source: "db",
    accountSid: String(row.accountSid || "").trim(),
    authTokenMasked: maskSecret(row.authToken),
    apiKeySid: String(row.apiKeySid || "").trim(),
    apiKeySecretMasked: maskSecret(row.apiKeySecret),
    phoneNumber: row.phoneNumber ? String(row.phoneNumber).trim() : null,
    phoneNumber2: row.phoneNumber2 ? String(row.phoneNumber2).trim() : null,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

/**
 * @param {object} body
 * @param {object | null} existing
 */
export function parseTwilioMainSettingsBody(body, existing = null) {
  if (!body || typeof body !== "object") {
    return { error: "Request body is required" };
  }

  const accountSid = String(body.accountSid ?? existing?.accountSid ?? "").trim();
  let authToken = String(body.authToken ?? "").trim();
  const apiKeySidRaw = body.apiKeySid != null ? String(body.apiKeySid).trim() : null;
  let apiKeySecret = String(body.apiKeySecret ?? "").trim();

  const looksMasked = (v) => !v || v.startsWith("****");
  if (existing) {
    if (looksMasked(authToken)) authToken = String(existing.authToken || "").trim();
    if (looksMasked(apiKeySecret)) {
      apiKeySecret = String(existing.apiKeySecret || "").trim();
    }
  }

  if (!accountSid) return { error: "accountSid is required" };
  if (!authToken) return { error: "authToken is required" };
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    return { error: "accountSid must look like a Twilio Account SID (AC…)" };
  }

  let apiKeySid =
    apiKeySidRaw != null && apiKeySidRaw !== ""
      ? apiKeySidRaw
      : existing?.apiKeySid
        ? String(existing.apiKeySid).trim()
        : "";
  if (apiKeySid && !/^SK[a-f0-9]{32}$/i.test(apiKeySid)) {
    return { error: "apiKeySid must look like a Twilio API Key SID (SK…)" };
  }
  if (apiKeySid && !apiKeySecret) {
    return { error: "apiKeySecret is required when apiKeySid is set" };
  }

  let phoneNumber = null;
  if (body.phoneNumber != null && String(body.phoneNumber).trim() !== "") {
    phoneNumber = normalizeToE164(body.phoneNumber);
    if (!phoneNumber) return { error: "phoneNumber must be valid E.164" };
  }

  let phoneNumber2 = null;
  if (body.phoneNumber2 != null && String(body.phoneNumber2).trim() !== "") {
    phoneNumber2 = normalizeToE164(body.phoneNumber2);
    if (!phoneNumber2) return { error: "phoneNumber2 must be valid E.164" };
  }

  return {
    data: {
      accountSid,
      authToken,
      apiKeySid: apiKeySid || null,
      apiKeySecret: apiKeySid ? apiKeySecret : null,
      phoneNumber,
      phoneNumber2,
    },
  };
}
