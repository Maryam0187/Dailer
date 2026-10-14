import OneSignal from "react-onesignal";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";

let initPromise = null;
let configPromise = null;
let runtimeConfig = null;

function getBuildTimeAppId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

function getBuildTimeSafariWebId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

/** App ID from /api/push/config (Railway) or build-time NEXT_PUBLIC_*. */
export async function loadOneSignalConfig() {
  if (runtimeConfig) return runtimeConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const buildAppId = getBuildTimeAppId();
    const buildSafari = getBuildTimeSafariWebId();

    if (typeof window === "undefined") {
      runtimeConfig = { appId: buildAppId || null, safariWebId: buildSafari || null };
      return runtimeConfig;
    }

    try {
      const res = await fetch("/api/push/config", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      runtimeConfig = {
        appId: String(json?.appId || buildAppId || "").trim() || null,
        safariWebId: String(json?.safariWebId || buildSafari || "").trim() || null,
      };
    } catch {
      runtimeConfig = { appId: buildAppId || null, safariWebId: buildSafari || null };
    }
    return runtimeConfig;
  })();

  return configPromise;
}

export function getBrowserNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function isPushEnabled() {
  return getBrowserNotificationPermission() === "granted";
}

export async function ensureOneSignalInitialized() {
  if (typeof window === "undefined") return null;

  const config = await loadOneSignalConfig();
  if (!config?.appId) {
    console.warn("[onesignal] App ID missing — set ONESIGNAL_APP_ID on Railway");
    return null;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const options = {
        appId: config.appId,
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        notifyButton: { enable: false },
        serviceWorkerPath: "OneSignalSDKWorker.js",
      };
      if (config.safariWebId) options.safari_web_id = config.safariWebId;

      try {
        await OneSignal.init(options);
      } catch (err) {
        const message = String(err?.message || err || "");
        if (!/already initialized|initialized before/i.test(message)) {
          initPromise = null;
          console.warn("[onesignal] init failed", message);
          return null;
        }
      }
      return OneSignal;
    })();
  }

  return initPromise;
}

async function optInIfAllowed() {
  if (getBrowserNotificationPermission() !== "granted") return;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch {
    /* ignore */
  }
}

/** Link this browser to dialer user as <username>_<id>. */
export async function loginOneSignalUser(userId, username) {
  const externalId = toOneSignalExternalId(userId, username);
  if (!externalId) return null;

  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return null;

  const current = String(OneSignal.User?.externalId || "");
  if (current === externalId) {
    await optInIfAllowed();
    return externalId;
  }

  // Switching accounts on a shared browser
  if (current && current !== externalId && !current.startsWith("local-")) {
    try {
      await OneSignal.logout();
    } catch {
      /* ignore */
    }
  }

  try {
    await OneSignal.login(externalId);
  } catch (err) {
    console.warn("[onesignal] login failed", err?.message || err);
    return null;
  }

  await optInIfAllowed();
  console.info("[onesignal] linked", externalId);
  return externalId;
}

/**
 * Call from a button click only (needs user gesture).
 * Asks Chrome for permission, then opts into OneSignal push.
 */
export async function enablePush() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { ok: false, permission: "unsupported" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission === "granted") {
    await ensureOneSignalInitialized();
    await optInIfAllowed();
  }

  return { ok: permission === "granted", permission };
}
