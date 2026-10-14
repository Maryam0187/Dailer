/**
 * Normalize Railway/env values that often arrive wrapped in quotes or with newlines.
 */
export function cleanEnv(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function getOneSignalAppId() {
  return cleanEnv(
    process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "",
  );
}

export function getOneSignalRestApiKey() {
  return cleanEnv(process.env.ONESIGNAL_REST_API_KEY || "");
}

export function getOneSignalSafariWebId() {
  return cleanEnv(
    process.env.ONESIGNAL_SAFARI_WEB_ID || process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "",
  );
}

/**
 * Soft validation for logs — never prints the secret.
 */
export function describeOneSignalAuth() {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  return {
    hasAppId: Boolean(appId),
    hasRestApiKey: Boolean(apiKey),
    restApiKeyLooksValid: apiKey.startsWith("os_v2_app_"),
    restApiKeyPrefix: apiKey ? `${apiKey.slice(0, 10)}…` : null,
    hint: !apiKey
      ? "Set ONESIGNAL_REST_API_KEY on Railway (App API key from Settings → Keys & IDs). Value starts with os_v2_app_ — not the Key ID."
      : !apiKey.startsWith("os_v2_app_")
        ? "ONESIGNAL_REST_API_KEY does not look like an App API key (should start with os_v2_app_). Do not use App ID, Key ID, or Organization key."
        : null,
  };
}
