"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disablePushOnThisDevice,
  enablePush,
  fetchPushDevices,
  getLocalSubscriptionId,
  getPermission,
  isOptedIn,
  loadOneSignalConfig,
  loginOneSignalUser,
  removePushDevice,
  sendTestPush,
} from "@/lib/oneSignalClient";

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export default function ProfileClient({ userId, username, role = null }) {
  const [configured, setConfigured] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [hint, setHint] = useState("");
  const [permission, setPermission] = useState("default");
  const [optedIn, setOptedIn] = useState(false);
  const [localSubId, setLocalSubId] = useState(null);
  const [externalId, setExternalId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState("");

  const refreshLocal = useCallback(() => {
    setPermission(getPermission());
    setOptedIn(isOptedIn());
    setLocalSubId(getLocalSubscriptionId());
  }, []);

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const result = await fetchPushDevices();
      setExternalId(result.externalId || null);
      setDevices(Array.isArray(result.devices) ? result.devices : []);
      if (result.auth?.hint) setHint(result.auth.hint);
    } catch (err) {
      setMessage(err?.message || "Could not load devices.");
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await loadOneSignalConfig();
      if (cancelled) return;
      setConfigured(Boolean(config?.appId));
      setServerReady(Boolean(config?.serverPushReady));
      if (config?.hint) setHint(config.hint);
      if (config?.appId && userId && username) {
        await loginOneSignalUser(userId, username);
        if (cancelled) return;
        refreshLocal();
      }
      await refreshDevices();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, username, refreshLocal, refreshDevices]);

  async function onEnable() {
    setBusy("enable");
    setMessage("");
    try {
      const result = await enablePush();
      await loginOneSignalUser(userId, username);
      refreshLocal();
      await refreshDevices();
      if (result.permission === "denied") {
        setMessage("Notifications are blocked. Site settings → Notifications → Allow, then try again.");
      } else if (result.ok) {
        setMessage("This device is subscribed.");
      } else {
        setMessage("Not subscribed yet — try Enable again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onDisableThis() {
    setBusy("disable");
    setMessage("");
    try {
      await disablePushOnThisDevice();
      refreshLocal();
      await refreshDevices();
      setMessage("Push turned off on this browser.");
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("test");
    setMessage("");
    try {
      const result = await sendTestPush();
      if (result.send?.ok) {
        setMessage(`Test sent to ${result.send.pushSubscriptions || 1} device(s).`);
      } else if (result.send?.reason === "no_subscription") {
        setMessage("No subscribed devices — enable on a browser first.");
      } else {
        setMessage(result.error || result.send?.reason || "Test failed.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(subscriptionId) {
    if (!window.confirm("Remove this device from message alerts?")) return;
    setBusy(`remove:${subscriptionId}`);
    setMessage("");
    try {
      const result = await removePushDevice(subscriptionId);
      if (result.ok) {
        if (subscriptionId === localSubId) {
          try {
            await disablePushOnThisDevice();
          } catch {
            /* ignore */
          }
        }
        refreshLocal();
        await refreshDevices();
        setMessage("Device removed.");
      } else {
        setMessage(result.error || "Could not remove device.");
      }
    } finally {
      setBusy(null);
    }
  }

  const thisDeviceOn = permission === "granted" && optedIn;
  const subscribed = devices.filter((d) => d.subscribed);
  const other = devices.filter((d) => !d.subscribed);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Account
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Username</dt>
            <dd className="font-medium text-zinc-950 dark:text-zinc-50">{username}</dd>
          </div>
          {role ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Role</dt>
              <dd className="font-medium capitalize text-zinc-950 dark:text-zinc-50">{role}</dd>
            </div>
          ) : null}
          {externalId ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Push ID</dt>
              <dd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{externalId}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Message notifications
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Enable on each phone or computer you use. Desktop Allow does not cover your phone.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              thisDeviceOn
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                : permission === "denied"
                  ? "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
          >
            This browser: {thisDeviceOn ? "on" : permission === "denied" ? "blocked" : "off"}
          </span>
        </div>

        {!configured ? (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
            Push is not configured (missing App ID).
          </p>
        ) : null}
        {configured && !serverReady ? (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
            {hint || "Server REST API key is missing or invalid."}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy != null || !configured}
            onClick={() => void onEnable()}
            className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {busy === "enable" ? "…" : thisDeviceOn ? "Re-enable this device" : "Enable on this device"}
          </button>
          {thisDeviceOn ? (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void onDisableThis()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {busy === "disable" ? "…" : "Turn off this device"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy != null || !serverReady}
            onClick={() => void onTest()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {busy === "test" ? "…" : "Send test"}
          </button>
          <button
            type="button"
            disabled={busy != null || loadingDevices}
            onClick={() => void refreshDevices()}
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            Refresh list
          </button>
        </div>

        {message ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        ) : null}

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Subscribed devices ({subscribed.length})
          </h3>
          {loadingDevices ? (
            <p className="mt-2 text-sm text-zinc-500">Loading…</p>
          ) : subscribed.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              No devices yet. Tap Enable on this browser (and on your phone in Chrome).
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
              {subscribed.map((d) => {
                const isHere = localSubId && d.id === localSubId;
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {d.label}
                        {d.device_os ? ` · ${d.device_os}` : ""}
                        {isHere ? (
                          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950/60 dark:text-sky-200">
                            this browser
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Last active {formatWhen(d.last_active)}
                        <span className="mx-1">·</span>
                        <span className="font-mono">{String(d.id).slice(0, 8)}…</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => void onRemove(d.id)}
                      className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      {busy === `remove:${d.id}` ? "…" : "Remove"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {other.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-zinc-500">Inactive / unsubscribed ({other.length})</h3>
            <ul className="mt-2 space-y-2">
              {other.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
                  <span>
                    {d.label}
                    {d.device_os ? ` · ${d.device_os}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void onRemove(d.id)}
                    className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
