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
  const [users, setUsers] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyWithDevices, setOnlyWithDevices] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/push/admin/devices", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Failed to load");
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(json.users) ? json.users : []);
      setTotals(json.totals || null);
    } catch (err) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (onlyWithDevices && !(u.subscribedCount > 0)) return false;
      if (!q) return true;
      return (
        String(u.username || "").toLowerCase().includes(q) ||
        String(u.externalId || "").toLowerCase().includes(q) ||
        String(u.role || "").toLowerCase().includes(q)
      );
    });
  }, [users, query, onlyWithDevices]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user…"
          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={onlyWithDevices}
            onChange={(e) => setOnlyWithDevices(e.target.checked)}
            className="rounded"
          />
          With devices only
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-900"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {totals ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {totals.withDevices} / {totals.users} users have push · {totals.subscribedDevices} subscribed
          device(s)
        </p>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading && !users.length ? (
        <p className="text-sm text-zinc-500">Loading OneSignal subscriptions…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Schedule</th>
                <th className="px-3 py-2 font-semibold">Devices</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-900 dark:bg-zinc-950">
              {filtered.map((u) => (
                <tr key={u.userId}>
                  <td className="px-3 py-3 align-top">
                    <p className="font-semibold text-zinc-950 dark:text-zinc-50">{u.username}</p>
                    <p className="text-xs text-zinc-500">
                      {u.role}
                      {u.active === false ? " · inactive" : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                      {u.externalId || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-zinc-600 dark:text-zinc-400">
                    {u.schedule?.scheduleEnabled ? (
                      <>
                        <span
                          className={
                            u.schedule.inQuietHours
                              ? "font-semibold text-amber-700 dark:text-amber-300"
                              : "font-semibold text-emerald-700 dark:text-emerald-300"
                          }
                        >
                          {u.schedule.inQuietHours ? "Quiet now" : "Allowing now"}
                        </span>
                        <p className="mt-1">
                          {u.schedule.allowStartLocal}–{u.schedule.allowEndLocal}{" "}
                          {u.schedule.timezone}
                        </p>
                        <p>{(u.schedule.allowDaysLabels || []).join(", ")}</p>
                      </>
                    ) : (
                      <span>Any time</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {u.subscribedCount > 0 ? (
                      <ul className="space-y-1.5">
                        {(u.devices || [])
                          .filter((d) => d.subscribed)
                          .map((d) => (
                            <li key={d.id} className="text-xs text-zinc-700 dark:text-zinc-300">
                              <span className="font-medium">{d.label}</span>
                              {d.device_os ? ` · ${d.device_os}` : ""}
                              <span className="text-zinc-400"> · {formatWhen(d.last_active)}</span>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-zinc-400">No subscribed devices</span>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-zinc-500">
                    No users match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
