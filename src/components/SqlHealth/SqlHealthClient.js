"use client";

import { useCallback, useEffect, useState } from "react";

function formatBytes(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = value;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 10 || i === 0 ? 1 : 2)} ${units[i]}`;
}

function formatInt(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function formatPct(ratio) {
  if (ratio == null || !Number.isFinite(Number(ratio))) return "—";
  return `${(Number(ratio) * 100).toFixed(1)}%`;
}

function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function hintClass(severity) {
  if (severity === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100";
  }
  if (severity === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  return "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100";
}

function Kpi({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

export default function SqlHealthClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sql-health", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load SQL health");
      setData(json);
    } catch (err) {
      setError(err.message || "Failed to load SQL health");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading MySQL status…</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const { overview, efficiency, innodb, connections, locks, tables, digests, digestsAvailable, hints } =
    data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Collected {data.collectedAt ? new Date(data.collectedAt).toLocaleString() : "—"}
          {overview?.version ? ` · MySQL ${overview.version}` : ""}
        </span>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Uptime" value={formatUptime(overview?.uptimeSeconds)} />
        <Kpi
          label="Connections"
          value={`${formatInt(overview?.threadsConnected)} / ${formatInt(overview?.maxConnections)}`}
          sub={formatPct(overview?.connectionUsageRatio)}
        />
        <Kpi label="Buffer hit" value={formatPct(innodb?.bufferHitRatio)} sub="InnoDB pool" />
        <Kpi
          label="Table scan ratio"
          value={formatPct(efficiency?.tableScanRatio)}
          sub={`${formatInt(efficiency?.selectScans)} scans`}
        />
        <Kpi label="Slow queries" value={formatInt(efficiency?.slowQueries)} sub={`>${overview?.longQueryTimeSeconds ?? "?"}s`} />
        <Kpi
          label="Full joins"
          value={formatInt(efficiency?.fullJoins)}
          sub={`${formatInt(locks?.rowLockWaits)} lock waits`}
        />
      </div>

      <Section title="Hints">
        <ul className="space-y-2">
          {(hints || []).map((hint) => (
            <li
              key={hint.title}
              className={`rounded-xl border px-4 py-3 text-sm ${hintClass(hint.severity)}`}
            >
              <div className="font-semibold">{hint.title}</div>
              <p className="mt-1 opacity-90">{hint.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Query volume">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-left text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {[
                ["SELECT", efficiency?.selects],
                ["INSERT", efficiency?.inserts],
                ["UPDATE", efficiency?.updates],
                ["DELETE", efficiency?.deletes],
                ["Rows read", efficiency?.rowsRead],
                ["Rows inserted", efficiency?.rowsInserted],
                ["Rows updated", efficiency?.rowsUpdated],
                ["Rows deleted", efficiency?.rowsDeleted],
                ["Aborted clients", connections?.abortedClients],
                ["Aborted connects", connections?.abortedConnects],
                ["Row lock time (ms)", locks?.rowLockTimeMs],
                ["Buffer pool size", formatBytes(innodb?.bufferPoolSizeBytes)],
                ["Buffer pool usage", formatPct(innodb?.bufferPoolUsageRatio)],
              ].map(([label, value]) => (
                <tr key={label}>
                  <th className="px-4 py-2 font-medium text-zinc-600 dark:text-zinc-400">{label}</th>
                  <td className="px-4 py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                    {typeof value === "string" ? value : formatInt(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Largest tables">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Rows</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Indexes</th>
                <th className="px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(tables || []).map((t) => (
                <tr key={t.tableName}>
                  <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {t.tableName}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{formatInt(t.tableRows)}</td>
                  <td className="px-4 py-2 tabular-nums">{formatBytes(t.dataLength)}</td>
                  <td className="px-4 py-2 tabular-nums">{formatBytes(t.indexLength)}</td>
                  <td className="px-4 py-2 tabular-nums">{formatBytes(t.totalLength)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Top statements">
        {!digestsAvailable ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Statement digests unavailable on this MySQL instance
            {data.digestsError ? ` (${data.digestsError})` : ""}. Table sizes and status counters above
            still work.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Digest</th>
                  <th className="px-4 py-2">Execs</th>
                  <th className="px-4 py-2">Sum time (s)</th>
                  <th className="px-4 py-2">Rows examined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(digests || []).map((d, idx) => (
                  <tr key={`${idx}-${d.execCount}`}>
                    <td className="max-w-xl px-4 py-2 font-mono text-xs break-words text-zinc-800 dark:text-zinc-200">
                      {d.digestText || "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{formatInt(d.execCount)}</td>
                    <td className="px-4 py-2 tabular-nums">{d.sumTimeSeconds}</td>
                    <td className="px-4 py-2 tabular-nums">{formatInt(d.rowsExamined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
