import OneSignal from "react-onesignal";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";

let initPromise = null;
let configPromise = null;
let runtimeConfig = null;

/** Load App ID from GET /api/push/config (Railway-safe). */
export async function loadOneSignalConfig() {
  if (runtimeConfig) return runtimeConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const buildAppId = String(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
    const buildSafari = String(process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();

    if (typeof window === "undefined") {
      runtimeConfig = {
        appId: buildAppId || null,
        safariWebId: buildSafari || null,
        serverPushReady: false,
      };
      return runtimeConfig;
    }

    try {
      const res = await fetch("/api/push/config", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      runtimeConfig = {
        appId: String(json?.appId || buildAppId || "").trim() || null,
        safariWebId: String(json?.safariWebId || buildSafari || "").trim() || null,
        serverPushReady: Boolean(json?.serverPushReady),
        hint: json?.hint || null,
      };
    } catch {
      runtimeConfig = {
        appId: buildAppId || null,
        safariWebId: buildSafari || null,
        serverPushReady: false,
      };
    }
    return runtimeConfig;
  })();

  return configPromise;
}

export function getPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function isOptedIn() {
  try {
    return Boolean(OneSignal?.User?.PushSubscription?.optedIn);
  } catch {
    return false;
  }
}

export function getLocalSubscriptionId() {
  try {
    const id = OneSignal?.User?.PushSubscription?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

export async function ensureOneSignalInitialized() {
  if (typeof window === "undefined") return null;

  const config = await loadOneSignalConfig();
  if (!config?.appId) {
    console.warn("[onesignal] App ID missing");
    return null;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const options = {
        appId: config.appId,
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        serviceWorkerPath: "OneSignalSDKWorker.js",
        autoResubscribe: true,
        notifyButton: { enable: false },
        welcomeNotification: {
          title: "Dialer",
          message: "Notifications enabled on this device.",
        },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                text: {
                  actionMessage: "Get dialer message alerts on this device.",
                  acceptButton: "Allow",
                  cancelButton: "No Thanks",
                },
              },
            ],
          },
        },
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
  if (getPermission() !== "granted") return;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch {
    /* ignore */
  }
}

/** Link browser to dialer user as <username>_<id>. */
export async function loginOneSignalUser(userId, username) {
  const externalId = toOneSignalExternalId(userId, username);
  if (!externalId) return null;

  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return null;

  const current = String(OneSignal.User?.externalId || "");
  if (current !== externalId) {
    if (current && !current.startsWith("local-")) {
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
  }

  await optInIfAllowed();
  return externalId;
}

/**
 * Enable push on this device (user gesture).
 * Shows OneSignal Slidedown → native Allow, then opts in.
 */
export async function enablePush() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { ok: false, permission: "unsupported" };
  }

  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return { ok: false, permission: getPermission(), reason: "not_configured" };

  let permission = getPermission();
  if (permission === "denied") {
    return { ok: false, permission: "denied" };
  }

  try {
    if (OneSignal.Slidedown?.promptPush) {
      await OneSignal.Slidedown.promptPush({ force: true });
    } else if (permission === "default") {
      permission = await Notification.requestPermission();
    }
  } catch (err) {
    console.warn("[onesignal] enable failed", err?.message || err);
  }

  permission = getPermission();
  if (permission === "granted") await optInIfAllowed();

  return { ok: permission === "granted" && isOptedIn(), permission, optedIn: isOptedIn() };
}

/** Turn off push on this browser only (keeps other devices). */
export async function disablePushOnThisDevice() {
  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return { ok: false, reason: "not_configured" };
  try {
    await OneSignal.User.PushSubscription.optOut();
  } catch (err) {
    console.warn("[onesignal] optOut failed", err?.message || err);
    return { ok: false, reason: "opt_out_failed" };
  }
  return { ok: true, permission: getPermission(), optedIn: isOptedIn() };
}

/** POST /api/push/test — server sends a push to the logged-in user. */
export async function sendTestPush() {
  const res = await fetch("/api/push/test", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, status: res.status, ...json };
}

/** GET /api/push/devices */
export async function fetchPushDevices() {
  const res = await fetch("/api/push/devices", {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, status: res.status, ...json };
}

/** DELETE /api/push/devices/:id */
export async function removePushDevice(subscriptionId) {
  const res = await fetch(`/api/push/devices/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, status: res.status, ...json };
}
