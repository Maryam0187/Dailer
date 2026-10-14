"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  getPermission,
  isOptedIn,
  loadOneSignalConfig,
  loginOneSignalUser,
  sendTestPush,
} from "@/lib/oneSignalClient";

/**
 * Init + link External ID on login.
 * Compact bar: Enable (this device) + Test push (server).
 */
export default function OneSignalProvider({ userId = null, username = null }) {
  const [configured, setConfigured] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" ? getPermission() : "default",
  );
  const [optedIn, setOptedIn] = useState(false);
  const [busy, setBusy] = useState(null); // "enable" | "test" | null
  const [status, setStatus] = useState("");

  function refresh() {
    setPermission(getPermission());
    setOptedIn(isOptedIn());
  }

  useEffect(() => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0 || !username) return undefined;

    let cancelled = false;

    void (async () => {
      const config = await loadOneSignalConfig();
      if (cancelled) return;
      setConfigured(Boolean(config?.appId));
      setServerReady(Boolean(config?.serverPushReady));
      if (!config?.appId) return;

      await loginOneSignalUser(id, username);
      if (cancelled) return;
      refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, username]);

  async function onEnable() {
    setBusy("enable");
    setStatus("");
    try {
      const result = await enablePush();
      if (Number(userId) > 0 && username) {
        await loginOneSignalUser(userId, username);
      }
      refresh();
      if (result.permission === "denied") {
        setStatus("Blocked — unlock site notifications, then try again.");
      } else if (result.ok) {
        setStatus("Enabled on this device.");
      } else {
        setStatus("Not subscribed yet — tap Enable again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("test");
    setStatus("");
    try {
      const result = await sendTestPush();
      if (result.send?.ok) {
        setStatus(`Test sent (${result.send.pushSubscriptions || 1} device).`);
      } else if (result.send?.reason === "no_subscription") {
        setStatus("No subscribed device — tap Enable first on this browser.");
      } else if (result.send?.reason === "invalid_api_key" || result.send?.status === 401) {
        setStatus("Server REST key invalid.");
      } else if (!result.httpOk) {
        setStatus(result.error || "Test failed.");
      } else {
        setStatus(result.send?.reason || result.auth?.hint || "Test failed.");
      }
    } catch (err) {
      setStatus(err?.message || "Test failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!configured || !Number(userId) || !username) return null;

  const enabled = permission === "granted" && optedIn;

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">Push</span>
        <span className="text-zinc-500">
          {enabled ? "on" : permission === "denied" ? "blocked" : "off"}
          {!serverReady ? " · server key?" : ""}
        </span>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void onEnable()}
          className="rounded-md bg-sky-700 px-2.5 py-1 font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {busy === "enable" ? "…" : enabled ? "Re-enable" : "Enable"}
        </button>
        <button
          type="button"
          disabled={busy != null || !serverReady}
          onClick={() => void onTest()}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {busy === "test" ? "…" : "Test push"}
        </button>
        {status ? <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-400">{status}</span> : null}
      </div>
    </div>
  );
}
