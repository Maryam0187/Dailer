import OneSignal from "react-onesignal";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";

let initPromise = null;
let configPromise = null;
let runtimeConfig = null;
let indexedDbOk = null;

function getBuildTimeAppId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

function getBuildTimeSafariWebId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

/**
 * OneSignal requires IndexedDB. Private mode / blocked storage / some Linux
 * profiles fail with "Internal error opening backing store for indexedDB.open".
 */
export async function checkIndexedDbAvailable() {
  if (typeof window === "undefined") return false;
  if (indexedDbOk != null) return indexedDbOk;

  if (!window.indexedDB) {
    indexedDbOk = false;
    return false;
  }

  indexedDbOk = await new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const req = window.indexedDB.open("__dialer_onesignal_idb_probe__");
      req.onerror = () => done(false);
      req.onblocked = () => done(false);
      req.onsuccess = () => {
        try {
          req.result?.close?.();
          window.indexedDB.deleteDatabase("__dialer_onesignal_idb_probe__");
        } catch {
          /* ignore */
        }
        done(true);
      };
      setTimeout(() => done(false), 2500);
    } catch {
      done(false);
    }
  });

  return indexedDbOk;
}

/**
 * Resolve App ID at runtime via /api/push/config so Railway server env works
 * even when NEXT_PUBLIC_* was missing from the client build.
 */
export async function loadOneSignalConfig() {
  if (runtimeConfig) return runtimeConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const buildAppId = getBuildTimeAppId();
    const buildSafari = getBuildTimeSafariWebId();

    if (typeof window === "undefined") {
      runtimeConfig = {
        enabled: Boolean(buildAppId),
        appId: buildAppId || null,
        safariWebId: buildSafari || null,
      };
      return runtimeConfig;
    }

    try {
      const res = await fetch("/api/push/config", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      runtimeConfig = {
        enabled: Boolean(json?.appId || buildAppId),
        appId: String(json?.appId || buildAppId || "").trim() || null,
        safariWebId: String(json?.safariWebId || buildSafari || "").trim() || null,
      };
    } catch (err) {
      console.warn("[onesignal] failed to load /api/push/config", err?.message || err);
      runtimeConfig = {
        enabled: Boolean(buildAppId),
        appId: buildAppId || null,
        safariWebId: buildSafari || null,
      };
    }
    return runtimeConfig;
  })();

  return configPromise;
}

export function isOneSignalConfigured() {
  if (runtimeConfig) return Boolean(runtimeConfig.appId);
  return Boolean(getBuildTimeAppId());
}

/** Native browser permission: "default" | "granted" | "denied" | "unsupported" */
export function getBrowserNotificationPermission() {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Whether this browser has an active OneSignal web-push subscription.
 * Permission can be "granted" while optedIn is still false (common after
 * switching accounts or before the user taps Enable).
 */
export function getPushSubscriptionState() {
  const permission = getBrowserNotificationPermission();
  try {
    const sub = OneSignal?.User?.PushSubscription;
    return {
      permission,
      id: sub?.id ? String(sub.id) : null,
      optedIn: Boolean(sub?.optedIn),
    };
  } catch {
    return { permission, id: null, optedIn: false };
  }
}

export function isDevicePushReady() {
  const state = getPushSubscriptionState();
  return state.permission === "granted" && state.optedIn;
}

export async function ensureOneSignalInitialized() {
  if (typeof window === "undefined") return null;

  const idbOk = await checkIndexedDbAvailable();
  if (!idbOk) {
    console.warn(
      "[onesignal] IndexedDB unavailable — close all tabs for this site and reopen in a normal (non-private) window",
    );
    return null;
  }

  const config = await loadOneSignalConfig();
  const appId = config?.appId;
  if (!appId) {
    console.warn(
      "[onesignal] App ID missing. Set ONESIGNAL_APP_ID or NEXT_PUBLIC_ONESIGNAL_APP_ID on the server and redeploy.",
    );
    return null;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const options = {
        appId,
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        notifyButton: { enable: false },
        serviceWorkerPath: "OneSignalSDKWorker.js",
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                text: {
                  actionMessage:
                    "Allow notifications so we can reach you when you're away from the dialer.",
                  acceptButton: "Allow",
                  cancelButton: "Not now",
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
        if (/indexeddb|backing store|internal error/i.test(message)) {
          indexedDbOk = false;
          initPromise = null;
          console.warn("[onesignal] init failed due to IndexedDB", message);
          return null;
        }
        if (!/already initialized|initialized before/i.test(message)) {
          initPromise = null;
          throw err;
        }
      }
      return OneSignal;
    })();
  }

  return initPromise;
}

async function ensurePushOptedInQuietly() {
  if (getBrowserNotificationPermission() !== "granted") return;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch {
    /* ignore */
  }
}

export function getOneSignalExternalId() {
  try {
    return String(OneSignal.User?.externalId || "").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Link this browser subscription to dialer userId (OneSignal external_id).
 * Uses <username>_<id>.
 *
 * Important: do NOT logout()+login() when the External ID already exists on
 * another OneSignal user — that causes user-2 "Aliases claimed by another User".
 * Just call login(externalId); OneSignal switches this subscription to that user.
 */
export async function loginOneSignalUser(userId, username, { force = false } = {}) {
  const externalId = toOneSignalExternalId(userId, username);
  if (!externalId) return null;

  const sdk = await ensureOneSignalInitialized();
  if (!sdk || typeof OneSignal?.login !== "function") {
    return null;
  }

  const currentExternalId = String(OneSignal.User?.externalId || "");

  if (!force && currentExternalId === externalId) {
    await ensurePushOptedInQuietly();
    return externalId;
  }

  // Only logout when switching from a *different identified* user on a shared browser.
  const switchingIdentifiedUser =
    Boolean(currentExternalId) &&
    currentExternalId !== externalId &&
    !currentExternalId.startsWith("local-");

  if (switchingIdentifiedUser) {
    try {
      await OneSignal.logout();
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      /* ignore */
    }
  }

  try {
    await OneSignal.login(externalId);
  } catch (err) {
    const message = String(err?.message || err || "");
    console.warn("[onesignal] login warning", message || err);
    // SDK can throw opaque "reading 'Qe'" when IndexedDB/init is broken — don't retry loop.
    if (/indexeddb|backing store|Qe|undefined/i.test(message)) {
      indexedDbOk = false;
      return null;
    }
    if (!/user-2|Aliases claimed|claimed by another/i.test(message)) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        await OneSignal.login(externalId);
      } catch (retryErr) {
        console.warn("[onesignal] login retry failed", retryErr?.message || retryErr);
        return null;
      }
    }
  }

  await ensurePushOptedInQuietly();

  await new Promise((r) => setTimeout(r, 500));
  const linked = getOneSignalExternalId();
  if (linked === externalId) {
    console.info("[onesignal] linked External ID", linked);
  }
  return linked === externalId ? externalId : null;
}

function withTimeout(promise, ms, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Ask for push when browser permission is still "default".
 * On button click (force), call native Notification.requestPermission() first
 * (before awaiting OneSignal init) so Chrome still treats it as a user gesture.
 */
export async function promptForPushPermission({ force = false } = {}) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { ok: false, reason: "unsupported", permission: "unsupported" };
  }

  let permission = getBrowserNotificationPermission();
  if (permission === "unsupported") {
    return { ok: false, reason: "unsupported", permission: "unsupported" };
  }
  if (permission === "granted") {
    try {
      await ensureOneSignalInitialized();
      await ensurePushOptedInQuietly();
    } catch {
      /* ignore */
    }
    return { ok: true, permission: "granted" };
  }
  if (permission === "denied") {
    return { ok: false, reason: "denied", permission: "denied" };
  }

  try {
    if (force) {
      // CRITICAL: do not await anything before this — loses the click gesture.
      const result = await withTimeout(
        Promise.resolve(Notification.requestPermission()),
        20000,
        "Notification.requestPermission",
      );
      permission = result || getBrowserNotificationPermission();
    } else {
      const sdk = await ensureOneSignalInitialized();
      if (!sdk) return { ok: false, reason: "not_configured" };
      if (OneSignal.Slidedown?.promptPush) {
        await withTimeout(OneSignal.Slidedown.promptPush({ force: false }), 15000, "Slidedown");
        permission = getBrowserNotificationPermission();
      } else {
        const result = await withTimeout(
          Promise.resolve(Notification.requestPermission()),
          20000,
          "Notification.requestPermission",
        );
        permission = result || getBrowserNotificationPermission();
      }
    }
  } catch (err) {
    console.warn("[onesignal] permission prompt failed", err?.message || err);
    permission = getBrowserNotificationPermission();
    if (permission === "default") {
      return { ok: false, reason: "prompt_failed", permission };
    }
  }

  if (permission === "granted") {
    try {
      await ensureOneSignalInitialized();
      await ensurePushOptedInQuietly();
    } catch (err) {
      console.warn("[onesignal] optIn after grant failed", err?.message || err);
    }
  }

  return {
    ok: permission === "granted",
    permission,
    reason: permission === "denied" ? "denied" : permission === "granted" ? undefined : "dismissed",
  };
}
