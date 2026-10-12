import { normalizeToE164 } from "@/server/calls/normalizePhone";

function maskSecret(value) {
  const s = String(value || "");
  if (!s) return null;
  if (s.length <= 4) return "****";
  return `****${s.slice(-4)}`;
}

/** Public/admin JSON — never returns full secrets. */
export function serializeManagerTwilioAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    managerId: row.managerId,
    accountSid: String(row.accountSid || "").trim(),
    authTokenMasked: maskSecret(row.authToken),
    apiKeySid: String(row.apiKeySid || "").trim(),
    apiKeySecretMasked: maskSecret(row.apiKeySecret),
    defaultFromNumber: row.defaultFromNumber ? String(row.defaultFromNumber).trim() : null,
    configured: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Parse PUT body for upsert. Requires all credential fields on create;
 * on update, omitted secret fields keep existing values when masked placeholders sent.
 * @param {object} body
 * @param {object | null} existing
 * @returns {{ error?: string, data?: object }}
 */
export function parseManagerTwilioAccountBody(body, existing = null) {
  if (!body || typeof body !== "object") {
    return { error: "Request body is required" };
  }

  const accountSid = String(body.accountSid ?? existing?.accountSid ?? "").trim();
  const apiKeySid = String(body.apiKeySid ?? existing?.apiKeySid ?? "").trim();

  let authToken = String(body.authToken ?? "").trim();
  let apiKeySecret = String(body.apiKeySecret ?? "").trim();

  // Allow leaving secrets unchanged when client sends empty or masked value on update.
  const looksMasked = (v) => !v || v.startsWith("****");
  if (existing) {
    if (looksMasked(authToken)) authToken = String(existing.authToken || "").trim();
    if (looksMasked(apiKeySecret)) apiKeySecret = String(existing.apiKeySecret || "").trim();
  }

  if (!accountSid) return { error: "accountSid is required" };
  if (!authToken) return { error: "authToken is required" };
  if (!apiKeySid) return { error: "apiKeySid is required" };
  if (!apiKeySecret) return { error: "apiKeySecret is required" };

  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    return { error: "accountSid must look like a Twilio Account SID (AC…)" };
  }
  if (!/^SK[a-f0-9]{32}$/i.test(apiKeySid)) {
    return { error: "apiKeySid must look like a Twilio API Key SID (SK…)" };
  }

  let defaultFromNumber = null;
  if (body.defaultFromNumber != null && String(body.defaultFromNumber).trim() !== "") {
    defaultFromNumber = normalizeToE164(body.defaultFromNumber);
    if (!defaultFromNumber) {
      return { error: "defaultFromNumber must be a valid E.164 phone number" };
    }
  }

  return {
    data: {
      accountSid,
      authToken,
      apiKeySid,
      apiKeySecret,
      defaultFromNumber,
    },
  };
}
