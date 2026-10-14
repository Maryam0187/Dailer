"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  getBrowserNotificationPermission,
  loadOneSignalConfig,
  loginOneSignalUser,
} from "@/lib/oneSignalClient";

/**
 * Simple flow:
 * 1) On login → init OneSignal + link External ID
 * 2) If notifications not Allowed → show Enable banner
 * 3) User taps Enable → OS permission dialog (once per site)
 */
export default function OneSignalProvider({ userId = null, username = null }) {
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" ? getBrowserNotificationPermission() : "default",
  );
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0 || !username) return undefined;

    let cancelled = false;
    setDismissed(false);

    void (async () => {
      const config = await loadOneSignalConfig();
      if (cancelled || !config?.appId) {
        if (!cancelled) setReady(true);
        return;
      }
      await loginOneSignalUser(id, username);
      if (!cancelled) {
        setPermission(getBrowserNotificationPermission());
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, username]);

  async function onEnable() {
    setBusy(true);
    try {
      // Ask first (user gesture), then re-link this account
      const result = await enablePush();
      setPermission(result.permission);
      if (result.ok && Number(userId) > 0 && username) {
        await loginOneSignalUser(userId, username);
      }
      if (result.permission === "denied") {
        window.alert("Notifications blocked. Lock icon → Site settings → Notifications → Allow, then reload.");
      } else if (result.permission === "unsupported") {
        window.alert("This browser cannot show web notifications. Use Chrome on Android, or Add to Home Screen on iPhone.");
      }
    } finally {
      setBusy(false);
    }
  }

  const showBanner =
    ready &&
    !dismissed &&
    Number(userId) > 0 &&
    Boolean(username) &&
    permission !== "granted";

  if (!showBanner) return null;

  return (
    <div className="sticky top-0 z-[60] border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/95 dark:text-sky-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">
          {permission === "denied"
            ? "Notifications are blocked for this site."
            : "Enable notifications to get message alerts on this device."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onEnable()}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {busy ? "…" : permission === "denied" ? "How to enable" : "Enable notifications"}
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
