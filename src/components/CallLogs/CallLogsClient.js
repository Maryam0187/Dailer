"use client";

import { useEffect, useState } from "react";

export default function CallLogsClient() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callingId, setCallingId] = useState(null);
  const [error, setError] = useState(null);

  async function loadCalls({ signal, silent = false } = {}) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/calls", {
        method: "GET",
        credentials: "include",
        signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch call logs");
      setCalls(json.calls || []);
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message || "Failed to fetch call logs");
      if (!silent) setCalls([]);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  async function redial(toNumber, id) {
    setError(null);
    setCallingId(id);
    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toNumber }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to place call");
      await loadCalls({ silent: true });
    } catch (e) {
      setError(e.message || "Failed to place call");
    } finally {
      setCallingId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadCalls({ signal: controller.signal });
    const interval = setInterval(() => {
      loadCalls({ signal: controller.signal, silent: true });
    }, 10000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-sky-200/80 bg-white shadow-md shadow-sky-500/10 ring-1 ring-sky-500/10 dark:border-sky-900/45 dark:bg-zinc-900 dark:shadow-sky-950/15 dark:ring-sky-500/5">
      <div className="border-b-2 border-sky-200/70 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3.5 dark:border-sky-800/60 dark:from-sky-950/40 dark:to-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-sky-950 dark:text-sky-100">Call logs</h2>
            <p className="text-sm text-sky-800/80 dark:text-sky-300/90">
              Your recent outbound calls
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadCalls({ silent: true })}
            disabled={refreshing || loading}
            className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-700 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <p className="text-base text-zinc-600 dark:text-zinc-300">Loading...</p>
        ) : error ? (
          <p className="text-base font-medium text-red-600">{error}</p>
        ) : calls.length === 0 ? (
          <p className="text-base text-zinc-600 dark:text-zinc-300">No calls yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-zinc-200 text-sm uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {c.fromNumber || "—"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{c.toNumber}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">{c.status}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {c.durationSeconds ?? "—"}s
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => redial(c.toNumber, c.id)}
                        disabled={callingId === c.id}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                      >
                        {callingId === c.id ? "Calling..." : "Call"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
