"use client";

import { useEffect, useState } from "react";

export default function CallLogsClient() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/calls", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to fetch call logs");
        setCalls(json.calls || []);
      } catch (e) {
        if (e.name === "AbortError") return;
        setError(e.message || "Failed to fetch call logs");
        setCalls([]);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-sky-200/80 bg-white shadow-md shadow-sky-500/10 ring-1 ring-sky-500/10 dark:border-sky-900/45 dark:bg-zinc-900 dark:shadow-sky-950/15 dark:ring-sky-500/5">
      <div className="border-b-2 border-sky-200/70 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3.5 dark:border-sky-800/60 dark:from-sky-950/40 dark:to-zinc-900">
        <h2 className="text-lg font-semibold text-sky-950 dark:text-sky-100">Call logs</h2>
        <p className="text-sm text-sky-800/80 dark:text-sky-300/90">Your recent outbound calls</p>
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
                  <th className="py-2">Duration</th>
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
                    <td className="py-2 text-zinc-700 dark:text-zinc-200">
                      {c.durationSeconds ?? "—"}s
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
