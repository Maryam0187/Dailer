/**
 * Shared OneSignal env helpers (server only).
 * Railway values often arrive quoted — strip quotes; never log the full REST key.
 */

export function cleanEnv(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function getOneSignalAppId() {
  return cleanEnv(process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "");
}

export function getOneSignalRestApiKey() {
  return cleanEnv(process.env.ONESIGNAL_REST_API_KEY || "");
}

export function getOneSignalSafariWebId() {
  return cleanEnv(
    process.env.ONESIGNAL_SAFARI_WEB_ID || process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "",
  );
}

export function isServerPushReady() {
  const appId = getOneSignalAppId();
  const key = getOneSignalRestApiKey();
  return Boolean(appId && key.startsWith("os_v2_app_"));
}

/** Safe diagnostics — never includes the secret. */
export function describeOneSignalAuth() {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  const restApiKeyLooksValid = apiKey.startsWith("os_v2_app_");
  let hint = null;
  if (!apiKey) {
    hint = "Set ONESIGNAL_REST_API_KEY (App API key starting with os_v2_app_, no quotes).";
  } else if (!restApiKeyLooksValid) {
    hint = "ONESIGNAL_REST_API_KEY must start with os_v2_app_ (not App ID / Key ID / org key).";
  } else if (!appId) {
    hint = "Set ONESIGNAL_APP_ID.";
  }
  return {
    hasAppId: Boolean(appId),
    hasRestApiKey: Boolean(apiKey),
    restApiKeyLooksValid,
    serverPushReady: Boolean(appId && restApiKeyLooksValid),
    hint,
  };
}
