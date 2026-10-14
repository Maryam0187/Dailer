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

/** This browser's OneSignal subscription — not shared via Chrome sync / same Google account. */
export function getLocalPushState() {
  const permission = getBrowserNotificationPermission();
  try {
    const sub = OneSignal?.User?.PushSubscription;
    const id = sub?.id ? String(sub.id) : null;
    const optedIn = Boolean(sub?.optedIn);
    return {
      permission,
      id,
      optedIn,
      // Hide banner once this browser opted in (subscription id can lag a second)
      ready: permission === "granted" && optedIn,
    };
  } catch {
    return { permission, id: null, optedIn: false, ready: false };
  }
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
  if (getBrowserNotificationPermission() !== "granted") return null;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (err) {
    console.warn("[onesignal] optIn failed", err?.message || err);
  }
  // Subscription id can appear a moment after optIn (esp. on mobile Chrome)
  for (let i = 0; i < 8; i++) {
    const state = getLocalPushState();
    if (state.id) {
      console.info("[onesignal] this device subscription", state.id);
      return state;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return getLocalPushState();
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
 * Asks Chrome for permission, then opts into OneSignal push on THIS device.
 */
export async function enablePush() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { ok: false, permission: "unsupported", ready: false };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { ok: false, permission, ready: false };
  }

  await ensureOneSignalInitialized();
  const state = await optInIfAllowed();
  return {
    ok: Boolean(state?.ready),
    permission,
    ready: Boolean(state?.ready),
    subscriptionId: state?.id || null,
  };
}
