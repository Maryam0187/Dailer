"use client";

import { useCallback, useEffect, useState } from "react";

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function formatDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return "—";
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SalesBotCallLogsClient({ isAdmin = false }) {
  const [calls, setCalls] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [view, setView] = useState("mine");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        view: isAdmin ? view : "mine",
      });
      const res = await fetch(`/api/sales-bot/calls?${qs}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load Sales Bot calls");
      setCalls(Array.isArray(json.calls) ? json.calls : []);
      setPagination(json.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || "Failed to load");
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [page, view, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Sales Bot call logs</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Only calls started from Sales Bot. They do not appear in the main dialer call log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <select
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={view}
              onChange={(e) => {
                setPage(1);
                setView(e.target.value);
              }}
            >
              <option value="mine">My calls</option>
              <option value="all">All users</option>
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-600"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !calls.length ? (
        <p className="text-sm text-zinc-500">No Sales Bot calls yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
              <tr>
                <th className="px-2 py-2 font-semibold">When</th>
                {isAdmin && view === "all" ? (
                  <th className="px-2 py-2 font-semibold">User</th>
                ) : null}
                <th className="px-2 py-2 font-semibold">To</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Answered by</th>
                <th className="px-2 py-2 font-semibold">Duration</th>
                <th className="px-2 py-2 font-semibold">Recording</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr
                  key={call.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-2 py-2 whitespace-nowrap text-zinc-800 dark:text-zinc-200">
                    {formatWhen(call.createdAt)}
                  </td>
                  {isAdmin && view === "all" ? (
                    <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">
                      {call.username || `#${call.userId}`}
                    </td>
                  ) : null}
                  <td className="px-2 py-2 font-mono text-zinc-800 dark:text-zinc-200">
                    {call.toNumber || "—"}
                  </td>
                  <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">{call.status || "—"}</td>
                  <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">
                    {call.answeredBy || "—"}
                  </td>
                  <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">
                    {formatDuration(call.durationSeconds)}
                  </td>
                  <td className="px-2 py-2">
                    {call.recordingUrl ? (
                      <a
                        href={call.recordingUrl}
                        className="font-semibold text-sky-700 hover:underline dark:text-sky-300"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-zinc-600"
          >
            Previous
          </button>
          <span className="text-zinc-600 dark:text-zinc-400">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-zinc-600"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
