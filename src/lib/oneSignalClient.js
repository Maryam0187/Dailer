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

function isOptedIn() {
  try {
    return Boolean(OneSignal?.User?.PushSubscription?.optedIn);
  } catch {
    return false;
  }
}

/**
 * OneSignal built-ins only:
 * - Slidedown soft prompt (auto)
 * - Subscription Bell (re-subscribe on any device)
 * - Welcome notification after Allow
 */
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
        serviceWorkerPath: "OneSignalSDKWorker.js",
        autoResubscribe: true,
        welcomeNotification: {
          title: "Dialer",
          message: "Notifications enabled on this device.",
        },
        // OneSignal Subscription Bell — use this on phone/desktop to Allow again
        notifyButton: {
          enable: true,
          size: "medium",
          position: "bottom-right",
          prenotify: true,
          showCredit: false,
          text: {
            "tip.state.unsubscribed": "Subscribe to message alerts",
            "tip.state.subscribed": "Message alerts on",
            "tip.state.blocked": "Notifications blocked — unblock in site settings",
            "message.prenotify": "Click to enable message alerts",
            "message.action.subscribed": "Thanks for subscribing!",
            "message.action.resubscribed": "You're subscribed again",
            "message.action.unsubscribed": "You won't receive alerts",
            "dialog.main.title": "Message notifications",
            "dialog.main.button.subscribe": "Allow",
            "dialog.main.button.unsubscribe": "Unsubscribe",
            "dialog.blocked.title": "Unblock notifications",
            "dialog.blocked.message": "Follow these instructions to allow notifications:",
          },
        },
        // OneSignal Slidedown → then browser native Allow
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: true,
                text: {
                  actionMessage: "Get dialer message alerts on this device.",
                  acceptButton: "Allow",
                  cancelButton: "No Thanks",
                },
                delay: {
                  pageViews: 1,
                  timeDelay: 1,
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
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch {
    /* ignore */
  }
}

/** OneSignal Slidedown (built-in). force=true if still not opted in after autoPrompt. */
export async function promptOneSignalPush({ force = false } = {}) {
  const sdk = await ensureOneSignalInitialized();
  if (!sdk) return;

  if (isOptedIn()) {
    await optInIfAllowed();
    return;
  }

  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    return;
  }

  try {
    if (OneSignal.Slidedown?.promptPush) {
      await OneSignal.Slidedown.promptPush({ force });
    }
  } catch (err) {
    console.warn("[onesignal] Slidedown failed", err?.message || err);
  }

  await optInIfAllowed();
}

/** Link this browser to dialer user as <username>_<id>. */
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
      console.info("[onesignal] linked", externalId);
    } catch (err) {
      console.warn("[onesignal] login failed", err?.message || err);
      return null;
    }
  }

  await optInIfAllowed();

  // If autoPrompt didn't subscribe this device yet, show Slidedown again
  if (!isOptedIn()) {
    await new Promise((r) => setTimeout(r, 1200));
    await promptOneSignalPush({ force: true });
  }

  return externalId;
}
