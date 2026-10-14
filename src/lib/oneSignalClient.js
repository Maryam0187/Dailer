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

/** Native browser permission: "default" | "granted" | "denied" */
export function getBrowserNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "denied";
  }
  return Notification.permission;
}

export async function ensureOneSignalInitialized() {
  if (typeof window === "undefined") return null;

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
  if (!sdk) return null;

  const currentExternalId = String(OneSignal.User?.externalId || "");

  if (!force && currentExternalId === externalId) {
    await ensurePushOptedInQuietly();
    return externalId;
  }

  // Only logout when switching from a *different identified* user on a shared browser
  // (e.g. maryam_5 → john_8). Never logout when current is empty/anonymous or already target —
  // logout creates a new anonymous user that then conflicts claiming the same alias.
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
    // user-2 / alias claimed: login() should still bind to the existing user; don't logout-retry.
    console.warn("[onesignal] login warning", message || err);
    if (!/user-2|Aliases claimed|claimed by another/i.test(message)) {
      // Soft retry once without logout
      try {
        await new Promise((r) => setTimeout(r, 400));
        await OneSignal.login(externalId);
      } catch (retryErr) {
        console.warn("[onesignal] login retry failed", retryErr?.message || retryErr);
      }
    }
  }

  await ensurePushOptedInQuietly();

  await new Promise((r) => setTimeout(r, 500));
  const linked = getOneSignalExternalId();
  if (linked !== externalId) {
    console.warn(
      "[onesignal] External ID not visible yet after login; expected",
      externalId,
      "got",
      linked,
    );
  } else {
    console.info("[onesignal] linked External ID", linked);
  }
  return externalId;
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
    return { ok: false, reason: "unsupported" };
  }

  let permission = getBrowserNotificationPermission();
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
