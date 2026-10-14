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
 * Uses <username>_<id> (avoids OneSignal rejecting bare "1" for admin).
 * @param {{ force?: boolean }} [options] force=true always logout+login to repair orphan subscriptions
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

  // Reset when forcing, or when switching away from a bad/old id (e.g. raw "1").
  if (force || (currentExternalId && currentExternalId !== externalId)) {
    try {
      await OneSignal.logout();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  async function tryLogin() {
    await OneSignal.login(externalId);
  }

  try {
    await tryLogin();
  } catch (err) {
    console.warn(
      "[onesignal] login failed, resetting local identity and retrying",
      err?.message || err,
    );
    try {
      await OneSignal.logout();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400));
    try {
      await tryLogin();
    } catch (retryErr) {
      console.warn(
        "[onesignal] login retry failed — clear site data for this origin and allow notifications again",
        retryErr?.message || retryErr,
      );
      throw retryErr;
    }
  }

  await ensurePushOptedInQuietly();

  // Give the SDK a moment to persist aliases, then log what we see.
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

/**
 * Ask for push when browser permission is still "default".
 * Prefer Slidedown (user clicks Allow) so Chrome does not silently block it.
 */
export async function promptForPushPermission({ force = false } = {}) {
  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return { ok: false, reason: "not_configured" };

  if (!OneSignal.Notifications?.isPushSupported?.()) {
    return { ok: false, reason: "unsupported" };
  }

  const permission = getBrowserNotificationPermission();
  if (permission === "granted") {
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch {
      /* already opted in */
    }
    return { ok: true, permission: "granted" };
  }
  if (permission === "denied") {
    return { ok: false, reason: "denied", permission: "denied" };
  }

  // Banner already explained why — go straight to the native browser dialog
  // (avoids OneSignal Slidedown + Chrome prompt both appearing).
  try {
    if (force) {
      await OneSignal.Notifications.requestPermission();
    } else {
      await OneSignal.Slidedown.promptPush({ force: false });
    }
  } catch (err) {
    console.warn("[onesignal] permission prompt failed", err?.message || err);
    try {
      await OneSignal.Notifications.requestPermission();
    } catch (nativeErr) {
      console.warn("[onesignal] requestPermission failed", nativeErr?.message || nativeErr);
      return { ok: false, reason: "prompt_failed" };
    }
  }

  return { ok: true, permission: getBrowserNotificationPermission() };
}
