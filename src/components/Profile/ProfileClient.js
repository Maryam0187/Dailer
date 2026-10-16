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
import ProfileAttendanceClient from "@/components/Profile/ProfileAttendanceClient";

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

const TABS = [
  {
    id: "account",
    label: "Account",
    description: "Username & display name",
  },
  {
    id: "notification",
    label: "Notification",
    description: "Push alerts & devices",
  },
  {
    id: "attendance",
    label: "Attendance",
    description: "Login & online time",
  },
];

function initialsFromUsername(name) {
  const parts = String(name || "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function ProfileClient({
  userId,
  username,
  role = null,
  initialDisplayName = null,
}) {
  const [activeTab, setActiveTab] = useState("account");
  const [displayName, setDisplayName] = useState(initialDisplayName || "");
  const [savedDisplayName, setSavedDisplayName] = useState(initialDisplayName || "");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
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

  async function onSaveDisplayName(e) {
    e.preventDefault();
    setAccountBusy(true);
    setAccountMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save display name");
      const next = json.displayName || "";
      setDisplayName(next);
      setSavedDisplayName(next);
      setAccountMessage("Display name saved.");
    } catch (err) {
      setAccountMessage(err.message || "Could not save display name");
    } finally {
      setAccountBusy(false);
    }
  }

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
  const activeMeta = TABS.find((t) => t.id === activeTab) || TABS[0];
  const shownName = savedDisplayName || username;
  const displayNameDirty = displayName.trim() !== savedDisplayName.trim();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:gap-6">
      <aside className="w-full shrink-0 lg:w-64 xl:w-72">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-100 bg-gradient-to-br from-zinc-50 to-white px-4 py-5 dark:border-zinc-800 dark:from-zinc-900/80 dark:to-zinc-950">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold tracking-wide text-white shadow-sm"
                aria-hidden
              >
                {initialsFromUsername(shownName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {shownName}
                </p>
                {savedDisplayName ? (
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    @{username}
                  </p>
                ) : role ? (
                  <p className="mt-0.5 text-xs font-medium capitalize text-zinc-500 dark:text-zinc-400">
                    {role}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <nav className="flex gap-1 p-2 lg:flex-col" aria-label="Profile sections">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-w-0 flex-1 flex-col rounded-xl px-3 py-2.5 text-left transition-colors lg:flex-none ${
                    active
                      ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800/60"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <span className="text-sm font-semibold">{tab.label}</span>
                  <span
                    className={`mt-0.5 hidden text-xs lg:block ${
                      active
                        ? "text-emerald-700/80 dark:text-emerald-300/80"
                        : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {activeMeta.label}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{activeMeta.description}</p>
        </div>

        {activeTab === "account" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Username</dt>
                <dd className="font-semibold text-zinc-950 dark:text-zinc-50">{username}</dd>
              </div>
              {role ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <dt className="font-medium text-zinc-500 dark:text-zinc-400">Role</dt>
                  <dd className="font-semibold capitalize text-zinc-950 dark:text-zinc-50">{role}</dd>
                </div>
              ) : null}
            </dl>

            <form onSubmit={(e) => void onSaveDisplayName(e)} className="mt-5 space-y-3">
              <div>
                <label
                  htmlFor="profile-display-name"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Display name
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  maxLength={128}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How your name appears in the app"
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Optional. Username stays your login; leave blank to use username.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={accountBusy || !displayNameDirty}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {accountBusy ? "Saving…" : "Save display name"}
                </button>
                {accountMessage ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{accountMessage}</p>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        {activeTab === "notification" ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    Message notifications
                  </h3>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Enable on each phone or computer you use. Desktop Allow does not cover your phone.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
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

              {externalId ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                  <span className="font-medium text-zinc-500 dark:text-zinc-400">Push ID</span>
                  <span className="break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {externalId}
                  </span>
                </div>
              ) : null}

              {!configured ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  Push is not configured (missing App ID).
                </p>
              ) : null}
              {configured && !serverReady ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  {hint || "Server REST API key is missing or invalid."}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy != null || !configured}
                  onClick={() => void onEnable()}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === "enable"
                    ? "…"
                    : thisDeviceOn
                      ? "Re-enable this device"
                      : "Enable on this device"}
                </button>
                {thisDeviceOn ? (
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void onDisableThis()}
                    className="rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {busy === "disable" ? "…" : "Turn off this device"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy != null || !serverReady}
                  onClick={() => void onTest()}
                  className="rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  {busy === "test" ? "…" : "Send test"}
                </button>
                <button
                  type="button"
                  disabled={busy != null || loadingDevices}
                  onClick={() => void refreshDevices()}
                  className="rounded-xl px-3.5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  Refresh list
                </button>
              </div>

              {message ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Subscribed devices
                <span className="ml-1.5 font-normal text-zinc-400">({subscribed.length})</span>
              </h3>
              {loadingDevices ? (
                <p className="mt-3 text-sm text-zinc-500">Loading…</p>
              ) : subscribed.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  No devices yet. Tap Enable on this browser (and on your phone in Chrome).
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {subscribed.map((d) => {
                    const isHere = localSubId && d.id === localSubId;
                    return (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {d.label}
                            {d.device_os ? ` · ${d.device_os}` : ""}
                            {isHere ? (
                              <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                                this browser
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Last active {formatWhen(d.last_active)}
                            <span className="mx-1">·</span>
                            <span className="font-mono">{String(d.id).slice(0, 8)}…</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy != null}
                          onClick={() => void onRemove(d.id)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          {busy === `remove:${d.id}` ? "…" : "Remove"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {other.length > 0 ? (
                <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-500">
                    Inactive / unsubscribed ({other.length})
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {other.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500"
                      >
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
            </div>
          </section>
        ) : null}

        {activeTab === "attendance" ? <ProfileAttendanceClient /> : null}
      </div>
    </div>
  );
}
