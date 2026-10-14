const SDK_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const SCRIPT_ID = "onesignal-sdk-page";

let scriptPromise = null;
let initPromise = null;
let didInit = false;

function getAppId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

function getSafariWebId() {
  return String(process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

export function isOneSignalConfigured() {
  return Boolean(getAppId());
}

function loadSdkScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (document.getElementById(SCRIPT_ID) || window.OneSignal) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SDK_SRC;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("OneSignal SDK failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

function withOneSignal(fn) {
  return new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        resolve(await fn(OneSignal));
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function ensureOneSignalInitialized() {
  const appId = getAppId();
  if (!appId || typeof window === "undefined") return null;

  await loadSdkScript();

  if (!initPromise) {
    initPromise = withOneSignal(async (OneSignal) => {
      if (!didInit) {
        const options = {
          appId,
          allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
          notifyButton: { enable: false },
          serviceWorkerPath: "OneSignalSDKWorker.js",
        };
        const safariWebId = getSafariWebId();
        if (safariWebId) options.safari_web_id = safariWebId;

        try {
          await OneSignal.init(options);
          didInit = true;
        } catch (err) {
          const message = String(err?.message || err || "");
          if (/already initialized|initialized before/i.test(message)) {
            didInit = true;
          } else {
            initPromise = null;
            throw err;
          }
        }
      }
      return OneSignal;
    });
  }

  return initPromise;
}

export async function loginOneSignalUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;

  const OneSignal = await ensureOneSignalInitialized();
  if (!OneSignal) return;

  await OneSignal.login(String(id));

  try {
    if (OneSignal.Notifications?.permission !== true) {
      await OneSignal.Notifications.requestPermission();
    }
  } catch (err) {
    console.warn("[onesignal] permission request failed", err?.message || err);
  }
}
