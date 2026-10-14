"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function AdminPushDevicesClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [onlySubscribed, setOnlySubscribed] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = includeInactive ? "?inactive=1" : "";
      const res = await fetch(`/api/push/admin/devices${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load devices");
      setUsers(Array.isArray(json.users) ? json.users : []);
      setSummary(json.summary || null);
    } catch (err) {
      setError(err?.message || "Failed to load");
      setUsers([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (onlySubscribed && !(u.subscribedCount > 0)) return false;
      if (!q) return true;
      return (
        String(u.username || "").toLowerCase().includes(q) ||
        String(u.externalId || "").toLowerCase().includes(q) ||
        String(u.role || "").toLowerCase().includes(q)
      );
    });
  }, [users, query, onlySubscribed]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-zinc-500">Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username or External ID"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={onlySubscribed}
            onChange={(e) => setOnlySubscribed(e.target.checked)}
          />
          Subscribed only
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive users
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Users", summary.userCount],
            ["With push", summary.subscribedUsers],
            ["Subscribed devices", summary.totalSubscribed],
            ["All devices", summary.totalDevices],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-semibold">User</th>
              <th className="px-3 py-2 font-semibold">External ID</th>
              <th className="px-3 py-2 font-semibold">Subscribed</th>
              <th className="px-3 py-2 font-semibold">Devices</th>
              <th className="px-3 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {loading && !users.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-zinc-500">
                  Loading OneSignal devices…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-zinc-500">
                  No users match.
                </td>
              </tr>
            ) : null}
            {filtered.map((u) => {
              const open = expandedId === u.userId;
              return (
                <FragmentRow
                  key={u.userId}
                  user={u}
                  open={open}
                  onToggle={() => setExpandedId(open ? null : u.userId)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ user: u, open, onToggle }) {
  return (
    <>
      <tr className="bg-white dark:bg-zinc-950">
        <td className="px-3 py-2.5">
          <div className="font-medium text-zinc-950 dark:text-zinc-50">{u.username}</div>
          <div className="text-xs capitalize text-zinc-500">
            {u.role}
            {!u.isActive ? " · inactive" : ""}
          </div>
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-300">
          {u.externalId || "—"}
        </td>
        <td className="px-3 py-2.5 tabular-nums">
          <span
            className={
              u.subscribedCount > 0
                ? "font-semibold text-emerald-700 dark:text-emerald-300"
                : "text-zinc-500"
            }
          >
            {u.subscribedCount}
          </span>
        </td>
        <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">{u.deviceCount}</td>
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
          >
            {open ? "Hide" : "Devices"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="bg-zinc-50/80 dark:bg-zinc-900/40">
          <td colSpan={5} className="px-3 py-3">
            {!u.devices?.length ? (
              <p className="text-sm text-zinc-500">
                No OneSignal devices for this user (External ID linked or not — no web push
                subscriptions).
              </p>
            ) : (
              <ul className="space-y-2">
                {u.devices.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div>
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {d.label}
                        {d.device_os ? ` · ${d.device_os}` : ""}
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                            d.subscribed
                              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {d.subscribed ? "Subscribed" : "Unsubscribed"}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        Last active {formatWhen(d.last_active)}
                        <span className="mx-1">·</span>
                        <span className="font-mono">{d.id}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {u.onesignalId ? (
              <p className="mt-2 font-mono text-xs text-zinc-500">OneSignal ID: {u.onesignalId}</p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
