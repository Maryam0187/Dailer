import OneSignal from "react-onesignal";

let initPromise = null;

function getAppId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

function getSafariWebId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

export function isOneSignalConfigured() {
  return Boolean(getAppId());
}

/** Native browser permission: "default" | "granted" | "denied" */
export function getBrowserNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "denied";
  }
  return Notification.permission;
}

export async function ensureOneSignalInitialized() {
  const appId = getAppId();
  if (!appId) {
    console.warn("[onesignal] NEXT_PUBLIC_ONESIGNAL_APP_ID is not set");
    return null;
  }
  if (typeof window === "undefined") return null;

  if (!initPromise) {
    initPromise = (async () => {
      const options = {
        appId,
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        notifyButton: { enable: false },
        serviceWorkerPath: "OneSignalSDKWorker.js",
        // Do not auto-prompt; we show our own banner / Slidedown after login.
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                text: {
                  actionMessage: "Allow notifications so we can reach you when you're away from the dialer.",
                  acceptButton: "Allow",
                  cancelButton: "Not now",
                },
              },
            ],
          },
        },
      };
      const safariWebId = getSafariWebId();
      if (safariWebId) options.safari_web_id = safariWebId;

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

export async function loginOneSignalUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;

  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return;

  await OneSignal.login(String(id));
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

  // permission === "default" — show OneSignal slide prompt, then native dialog
  try {
    await OneSignal.Slidedown.promptPush({ force: Boolean(force) });
  } catch (err) {
    console.warn("[onesignal] Slidedown.promptPush failed, trying native", err?.message || err);
    try {
      await OneSignal.Notifications.requestPermission();
    } catch (nativeErr) {
      console.warn("[onesignal] requestPermission failed", nativeErr?.message || nativeErr);
      return { ok: false, reason: "prompt_failed" };
    }
  }

  return { ok: true, permission: getBrowserNotificationPermission() };
}
