"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getBrowserNotificationPermission,
  loadOneSignalConfig,
  loginOneSignalUser,
  promptForPushPermission,
} from "@/lib/oneSignalClient";

/**
 * Links the logged-in dialer user to OneSignal and prompts for web push when
 * browser permission is still "default". Keeps the subscription after dialer logout.
 */
export default function OneSignalProvider({ userId = null }) {
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" ? getBrowserNotificationPermission() : "default",
  );
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [configChecked, setConfigChecked] = useState(false);

  const refreshPermission = useCallback(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        const config = await loadOneSignalConfig();
        if (cancelled) return;
        const enabled = Boolean(config?.appId);
        setConfigured(enabled);
        setConfigChecked(true);
        if (!enabled) {
          console.warn(
            "[onesignal] App ID missing on server. Set ONESIGNAL_APP_ID or NEXT_PUBLIC_ONESIGNAL_APP_ID and redeploy.",
          );
          return;
        }

        await loginOneSignalUser(id);
        if (cancelled) return;
        // Do not auto-open OneSignal Slidedown — only the top banner asks,
        // then the popup runs after the user clicks Enable.
        refreshPermission();
      } catch (err) {
        console.warn("[onesignal] setup failed", err?.message || err);
        if (!cancelled) setConfigChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshPermission]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.Notification) return undefined;
    const onChange = () => refreshPermission();
    try {
      navigator.permissions?.query?.({ name: "notifications" }).then((status) => {
        status.addEventListener?.("change", onChange);
      });
    } catch {
      /* ignore */
    }
    window.addEventListener("focus", onChange);
    return () => window.removeEventListener("focus", onChange);
  }, [refreshPermission]);

  async function onEnableClick() {
    setBusy(true);
    try {
      const result = await promptForPushPermission({ force: true });
      refreshPermission();
      if (result?.permission === "denied" || result?.reason === "denied") {
        window.alert(
          "Notifications are blocked for this site. Click the lock icon in the address bar → Notifications → Allow, then reload.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const showBanner =
    configChecked &&
    configured &&
    !dismissed &&
    Number(userId) > 0 &&
    (permission === "default" || permission === "denied");

  if (!showBanner) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">
          {permission === "denied"
            ? "Message notifications are blocked in this browser. Enable them to get alerts when you're offline."
            : "Enable notifications so we can reach you on this device when you're away from the dialer."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {permission === "default" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnableClick()}
              className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {busy ? "Asking…" : "Enable notifications"}
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
