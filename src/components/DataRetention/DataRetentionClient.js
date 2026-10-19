"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateInput } from "@/components/DateRangeFilter";

const inputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50";

const btnDanger =
  "inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50";

const btnSecondary =
  "inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function defaultBeforeDate() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatDateInput(d);
}

function formatInt(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

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

function targetsKey(targets) {
  return [...targets].sort().join(",");
}

export default function DataRetentionClient() {
  const [callLogs, setCallLogs] = useState(true);
  const [userActivities, setUserActivities] = useState(true);
  const [beforeDate, setBeforeDate] = useState(defaultBeforeDate);
  const [confirmText, setConfirmText] = useState("");

  const [coverage, setCoverage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [purgeResult, setPurgeResult] = useState(null);
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [backfillResult, setBackfillResult] = useState(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [error, setError] = useState(null);

  const targets = useMemo(() => {
    const list = [];
    if (callLogs) list.push("callLogs");
    if (userActivities) list.push("userActivities");
    return list;
  }, [callLogs, userActivities]);

  const previewMatches =
    preview &&
    preview.beforeDate === beforeDate &&
    targetsKey(preview.targets) === targetsKey(targets);

  const canPurge =
    previewMatches &&
    confirmText.trim() === "DELETE" &&
    targets.length > 0 &&
    !purgeLoading &&
    !previewLoading &&
    !backfillLoading;

  const loadCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/data-retention/coverage", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setCoverage(json);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  const invalidatePreview = useCallback(() => {
    setPreview(null);
    setPurgeResult(null);
    setOptimizeResult(null);
    setConfirmText("");
  }, []);

  const runBackfill = useCallback(async () => {
    setBackfillLoading(true);
    setError(null);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/data-retention/backfill", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Backfill failed");
      setBackfillResult(json);
      await loadCoverage();
    } catch (err) {
      setError(err.message || "Backfill failed");
    } finally {
      setBackfillLoading(false);
    }
  }, [loadCoverage]);

  const runPreview = useCallback(async () => {
    if (targets.length === 0) {
      setError("Select at least one target");
      return;
    }
    setPreviewLoading(true);
    setError(null);
    setPurgeResult(null);
    setOptimizeResult(null);
    try {
      const params = new URLSearchParams({
        beforeDate,
        targets: targets.join(","),
      });
      const res = await fetch(`/api/admin/data-retention/preview?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to preview");
      setPreview(json);
      if (json.callDaily) setCoverage(json.callDaily);
    } catch (err) {
      setPreview(null);
      setError(err.message || "Failed to preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [beforeDate, targets]);

  const runPurge = useCallback(async () => {
    if (!canPurge) return;
    setPurgeLoading(true);
    setError(null);
    setOptimizeResult(null);
    try {
      const res = await fetch("/api/admin/data-retention", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beforeDate,
          targets,
          confirm: "DELETE",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to purge");
      setPurgeResult(json);
      setConfirmText("");
      setPreview(null);
      await loadCoverage();
    } catch (err) {
      setError(err.message || "Failed to purge");
    } finally {
      setPurgeLoading(false);
    }
  }, [beforeDate, targets, canPurge, loadCoverage]);

  const runOptimize = useCallback(async () => {
    if (targets.length === 0) {
      setError("Select at least one target");
      return;
    }
    setOptimizeLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/data-retention/optimize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to optimize");
      setOptimizeResult(json);
    } catch (err) {
      setError(err.message || "Failed to optimize");
    } finally {
      setOptimizeLoading(false);
    }
  }, [targets]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="space-y-3 rounded-2xl border border-sky-200/80 bg-sky-50/60 p-4 dark:border-sky-900/40 dark:bg-sky-950/30">
        <h2 className="text-sm font-semibold text-sky-950 dark:text-sky-100">
          Date-wise aggregates (safe to purge raw logs)
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-sky-900/90 dark:text-sky-100/90">
          <li>
            <strong>Call reports</strong> use <code className="text-xs">CallDailyMetrics</code>{" "}
            (per user per day). Purge call logs only after backfill.
          </li>
          <li>
            <strong>Attendance</strong> already uses{" "}
            <code className="text-xs">AttendanceDailyRecords</code>. Purging user activities does
            not remove day present/absent/points — only login drill-down history.
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-3 text-sm text-sky-950 dark:text-sky-100">
          <span>
            Daily call rows: {formatInt(coverage?.dailyRows)}
            {coverage?.minDate && coverage?.maxDate
              ? ` (${coverage.minDate} → ${coverage.maxDate})`
              : ""}
          </span>
          <span className="text-sky-700/80 dark:text-sky-300/80">
            Raw call logs: {formatInt(coverage?.callLogRows)}
          </span>
          <button
            type="button"
            className={btnSecondary}
            disabled={backfillLoading}
            onClick={() => void runBackfill()}
          >
            {backfillLoading ? "Backfilling…" : "Backfill call daily metrics"}
          </button>
        </div>
        {backfillResult ? (
          <p className="text-xs text-sky-800 dark:text-sky-200">
            Backfill wrote {formatInt(backfillResult.rows)} daily rows.
          </p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
        <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Irreversible</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900/90 dark:text-amber-100/90">
          <li>Raw call logs and user activities cannot be restored from this app.</li>
          <li>Lead call history lists and activity audit trails thin out for purged dates.</li>
          <li>Purging call logs auto-refreshes CallDailyMetrics first so reports stay accurate.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Targets</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={callLogs}
              onChange={(e) => {
                setCallLogs(e.target.checked);
                invalidatePreview();
              }}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Call logs (all, including lead calls)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={userActivities}
              onChange={(e) => {
                setUserActivities(e.target.checked);
                invalidatePreview();
              }}
              className="h-4 w-4 rounded border-zinc-300"
            />
            User activities
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <label htmlFor="before-date" className={labelClass}>
          Delete records before
        </label>
        <input
          id="before-date"
          type="date"
          value={beforeDate}
          onChange={(e) => {
            setBeforeDate(e.target.value);
            invalidatePreview();
          }}
          className={inputClass}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Rows with <code className="text-xs">createdAt</code> before the start of this day
          (Asia/Karachi) will be deleted. Default is 90 days ago.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={previewLoading || targets.length === 0 || !beforeDate}
          onClick={() => void runPreview()}
        >
          {previewLoading ? "Counting…" : "Preview counts"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Preview</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Cutoff: {preview.cutoff} ({preview.timezone})
          </p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {preview.counts?.callLogs != null ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Call logs
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {formatInt(preview.counts.callLogs)}
                </dd>
              </div>
            ) : null}
            {preview.counts?.userActivities != null ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  User activities
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {formatInt(preview.counts.userActivities)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {formatInt(preview.total)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="space-y-3">
        <label htmlFor="confirm-delete" className={labelClass}>
          Type DELETE to confirm
        </label>
        <input
          id="confirm-delete"
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className={inputClass}
          disabled={!previewMatches}
        />
        <button
          type="button"
          className={btnDanger}
          disabled={!canPurge}
          onClick={() => void runPurge()}
        >
          {purgeLoading ? "Deleting…" : "Permanently delete"}
        </button>
        {!previewMatches ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Run preview with the current targets and date before deleting.
          </p>
        ) : null}
      </section>

      {purgeResult ? (
        <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
            Purge complete
          </h2>
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            Deleted {formatInt(purgeResult.totalDeleted)} rows total
            {purgeResult.deleted?.callLogs != null
              ? ` · call logs ${formatInt(purgeResult.deleted.callLogs)}`
              : ""}
            {purgeResult.deleted?.userActivities != null
              ? ` · activities ${formatInt(purgeResult.deleted.userActivities)}`
              : ""}
            .
          </p>
          {purgeResult.backfill ? (
            <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
              Call daily metrics refreshed ({formatInt(purgeResult.backfill.rows)} rows) before
              delete.
            </p>
          ) : null}
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
            Run Optimize below if you need the Docker MySQL volume to shrink.
          </p>
        </section>
      ) : null}

      <section className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Reclaim disk space
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <code className="text-xs">OPTIMIZE TABLE</code> rebuilds InnoDB files so free space
          returns to the volume. It can lock the table briefly — prefer a quiet window after a
          large purge.
        </p>
        <button
          type="button"
          className={btnSecondary}
          disabled={optimizeLoading || targets.length === 0}
          onClick={() => void runOptimize()}
        >
          {optimizeLoading ? "Optimizing…" : "Optimize selected tables"}
        </button>
        {optimizeResult?.results?.length ? (
          <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {optimizeResult.results.map((row) => (
              <li key={row.tableName}>
                <span className="font-medium">{row.tableName}</span>:{" "}
                {formatBytes(row.before?.totalLength)} → {formatBytes(row.after?.totalLength)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
