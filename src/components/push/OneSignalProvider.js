"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  getBrowserNotificationPermission,
  getLocalPushState,
  loadOneSignalConfig,
  loginOneSignalUser,
} from "@/lib/oneSignalClient";

/**
 * Same Chrome/Google account on phone + desktop is fine.
 * Push tokens are NOT synced — each device must subscribe itself.
 *
 * Flow: login → link External ID → if THIS device has no subscription id, show Enable.
 */
export default function OneSignalProvider({ userId = null, username = null }) {
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" ? getBrowserNotificationPermission() : "default",
  );
  const [deviceReady, setDeviceReady] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function refresh() {
    const state = getLocalPushState();
    setPermission(state.permission);
    setDeviceReady(state.ready);
  }

  useEffect(() => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0 || !username) return undefined;

    let cancelled = false;
    setDismissed(false);

    void (async () => {
      const config = await loadOneSignalConfig();
      if (cancelled) return;
      if (!config?.appId) {
        setSetupDone(true);
        return;
      }
      await loginOneSignalUser(id, username);
      if (cancelled) return;
      refresh();
      // Mobile Chrome often assigns the subscription id slightly later
      window.setTimeout(() => {
        if (!cancelled) refresh();
      }, 1000);
      setSetupDone(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, username]);

  async function onEnable() {
    setBusy(true);
    try {
      const result = await enablePush();
      if (Number(userId) > 0 && username) {
        await loginOneSignalUser(userId, username);
      }
      refresh();

      if (result.permission === "denied") {
        window.alert(
          "Notifications blocked on this phone. Chrome menu → Settings → Site settings → Notifications → Allow, then reload.",
        );
      } else if (result.permission === "unsupported") {
        window.alert(
          "Use Chrome on Android. On iPhone: Share → Add to Home Screen, open from that icon, then tap Enable.",
        );
      } else if (!result.ready) {
        window.alert(
          "Permission is on, but this phone is not subscribed yet. Keep Chrome open, tap Enable again, or clear site data for the dialer and retry.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // Show banner until THIS device has a OneSignal subscription id
  // (Chrome sync can make permission look "granted" without a phone token)
  const showBanner =
    setupDone &&
    !dismissed &&
    Number(userId) > 0 &&
    Boolean(username) &&
    !deviceReady;

  if (!showBanner) return null;

  const syncedButNotSubscribed = permission === "granted" && !deviceReady;

  return (
    <div className="sticky top-0 z-[60] border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/95 dark:text-sky-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">
          {permission === "denied"
            ? "Notifications are blocked on this device."
            : syncedButNotSubscribed
              ? "This phone still needs to subscribe for alerts (desktop Allow does not cover the phone)."
              : "Enable notifications on this device for message alerts."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onEnable()}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {busy ? "…" : permission === "denied" ? "How to enable" : "Enable on this phone"}
          </button>
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
