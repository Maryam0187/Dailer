"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkIndexedDbAvailable,
  getBrowserNotificationPermission,
  getPushSubscriptionState,
  isDevicePushReady,
  loadOneSignalConfig,
  loginOneSignalUser,
  promptForPushPermission,
} from "@/lib/oneSignalClient";

/**
 * OneSignal setup for logged-in users:
 * - load config, init, login(<username>_<id>)
 * - sticky banner when this device is not push-ready (permission or opt-in)
 *
 * Note: browsers only show the OS permission dialog once per site. If this
 * phone already Allowed for the dialer (e.g. while on another account), login
 * as admin will not ask again — we only need Enable / opt-in when not subscribed.
 */
export default function OneSignalProvider({ userId = null, username = null }) {
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" ? getBrowserNotificationPermission() : "default",
  );
  const [pushReady, setPushReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [configChecked, setConfigChecked] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  const refreshPushState = useCallback(() => {
    const nextPermission = getBrowserNotificationPermission();
    setPermission(nextPermission);
    setPushReady(isDevicePushReady());
  }, []);

  useEffect(() => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    if (!username) return undefined;

    let cancelled = false;
    // New login → show banner again if this device still needs push
    setDismissed(false);

    void (async () => {
      try {
        const idbOk = await checkIndexedDbAvailable();
        if (cancelled) return;
        if (!idbOk) {
          setStorageBlocked(true);
          setConfigured(true);
          setConfigChecked(true);
          return;
        }

        const config = await loadOneSignalConfig();
        if (cancelled) return;
        const enabled = Boolean(config?.appId);
        setConfigured(enabled);
        setConfigChecked(true);
        if (!enabled) return;

        await loginOneSignalUser(id, username, { force: false });
        if (cancelled) return;
        refreshPushState();

        // Re-check shortly after login — subscription id can appear a moment later
        window.setTimeout(() => {
          if (!cancelled) refreshPushState();
        }, 800);
      } catch (err) {
        const message = String(err?.message || err || "");
        console.warn("[onesignal] setup failed", message);
        if (/indexeddb|backing store/i.test(message)) {
          setStorageBlocked(true);
        }
        if (!cancelled) {
          setConfigured(true);
          setConfigChecked(true);
          refreshPushState();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, username, refreshPushState]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = () => refreshPushState();
    try {
      navigator.permissions?.query?.({ name: "notifications" }).then((status) => {
        status.addEventListener?.("change", onChange);
      });
    } catch {
      /* ignore */
    }
    window.addEventListener("focus", onChange);
    return () => window.removeEventListener("focus", onChange);
  }, [refreshPushState]);

  async function onEnableClick() {
    let permissionResult = getBrowserNotificationPermission();
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        // Keep this before other awaits so the click counts as a user gesture.
        permissionResult = await Notification.requestPermission();
      } else if (typeof Notification !== "undefined") {
        permissionResult = Notification.permission;
      }
    } catch (err) {
      console.warn("[onesignal] native permission failed", err?.message || err);
    }

    setBusy(true);
    try {
      const result = await promptForPushPermission({ force: true });
      refreshPushState();

      if (
        (result?.permission === "granted" || permissionResult === "granted") &&
        Number(userId) > 0 &&
        username
      ) {
        await loginOneSignalUser(userId, username, { force: false });
        refreshPushState();
      }

      const state = getPushSubscriptionState();
      const finalPermission =
        result?.permission || permissionResult || state.permission || getBrowserNotificationPermission();

      if (finalPermission === "unsupported") {
        window.alert(
          "This browser does not support web notifications. On iPhone, add the dialer to your Home Screen and open it from there, then tap Enable again.",
        );
      } else if (finalPermission === "denied") {
        window.alert(
          "Notifications are blocked. Tap the lock icon → Site settings → Notifications → Allow, then reload.",
        );
      } else if (finalPermission === "default") {
        window.alert(
          "Could not open the notification prompt. Use Chrome (not a private/incognito tab), then try again.",
        );
      } else if (finalPermission === "granted" && !isDevicePushReady()) {
        window.alert(
          "Permission is on, but push is not subscribed yet. Tap Enable notifications again, or reload and retry.",
        );
      }
    } catch (err) {
      console.warn("[onesignal] enable click failed", err?.message || err);
      refreshPushState();
    } finally {
      setBusy(false);
    }
  }

  const needsPermission =
    permission === "default" || permission === "denied" || permission === "unsupported";
  const needsOptIn = permission === "granted" && !pushReady;

  const showBanner =
    configChecked &&
    configured &&
    !dismissed &&
    Number(userId) > 0 &&
    Boolean(username) &&
    (storageBlocked || needsPermission || needsOptIn);

  if (!showBanner) return null;

  const bannerText = storageBlocked
    ? "Browser storage (IndexedDB) is blocked, so push cannot start. Close all dialer tabs, open a normal Chrome window (not Incognito), then reload."
    : permission === "unsupported"
      ? "This browser cannot show web notifications. On iPhone: Share → Add to Home Screen, open the dialer from the icon, then enable alerts."
      : permission === "denied"
        ? "Message notifications are blocked in this browser. Enable them to get alerts when you're away."
        : needsOptIn
          ? "Notifications are allowed, but this device is not subscribed for message alerts yet."
          : "Enable notifications so we can reach you on this device when you're away from the dialer.";

  const showEnableButton =
    !storageBlocked &&
    (permission === "default" || permission === "granted" || permission === "denied");

  return (
    <div className="sticky top-0 z-[60] border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/95 dark:text-sky-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">{bannerText}</p>
        <div className="flex shrink-0 items-center gap-2">
          {storageBlocked ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              Reload
            </button>
          ) : null}
          {showEnableButton ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnableClick()}
              className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {busy ? "Asking…" : permission === "denied" ? "How to enable" : "Enable notifications"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:text-sky-200 dark:hover:bg-sky-900/60"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
