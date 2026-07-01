"use client";

import { useCallback, useEffect, useState } from "react";

function formatRole(role) {
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return role || "—";
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function SummaryCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export default function FilesStatsPanel() {
  const [users, setUsers] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files/metrics", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load file stats");
      setUsers(json.users || []);
      setTotals(json.totals || null);
    } catch (err) {
      setError(err.message || "Failed to load file stats");
      setUsers([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          File counts and the most recently updated file per user.
        </p>
        <button
          type="button"
          onClick={() => void loadStats()}
          disabled={loading}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:bg-zinc-900 dark:text-indigo-200 dark:hover:bg-zinc-800"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Total files" value={loading ? "…" : (totals?.totalFiles ?? 0)} />
        <SummaryCard
          label="Users with files"
          value={loading ? "…" : (totals?.usersWithFiles ?? 0)}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/60">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">By user</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Number of files and each user&apos;s most recently updated file.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Files</th>
                <th className="px-4 py-3">Last file</th>
                <th className="px-4 py-3">Last updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((row) => (
                  <tr key={row.userId} className="text-zinc-800 dark:text-zinc-200">
                    <td className="px-4 py-3 font-medium">{row.username}</td>
                    <td className="px-4 py-3 text-xs capitalize text-zinc-600 dark:text-zinc-400">
                      {formatRole(row.role)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.fileCount}</td>
                    <td className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">
                      {row.lastFileName || "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDateTime(row.lastUpdatedAt)}
                    </td>
                  </tr>
                ))
              )}
              {totals && users.length > 0 && !loading ? (
                <tr className="bg-zinc-50 font-semibold text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{totals.totalFiles}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
