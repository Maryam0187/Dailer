"use client";

import { useCallback, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/exportCsv";
import { formatDuration } from "@/lib/formatDuration";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") {
    return { from: formatDateInput(today), to: formatDateInput(today) };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: formatDateInput(y), to: formatDateInput(y) };
  }
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  if (preset === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  return { from: "", to: "" };
}

const CSV_HEADERS = [
  "Username",
  "Role",
  "Total calls",
  "Completed",
  "No answer",
  "Failed/Canceled",
  "Busy",
  "Duration",
  "Duration (seconds)",
];

function metricsToCsvRow(row) {
  return [
    row.username,
    row.role,
    row.total,
    row.completed,
    row.noAnswer,
    row.failedOrCanceled,
    row.busy,
    formatDuration(row.durationSeconds),
    row.durationSeconds,
  ];
}

const DEFAULT_SORT_KEY = "total";
const DEFAULT_SORT_DIR = "desc";

function compareReportRows(a, b, key, dir) {
  const mult = dir === "asc" ? 1 : -1;
  if (key === "username" || key === "role") {
    const av = String(a[key] ?? "").toLowerCase();
    const bv = String(b[key] ?? "").toLowerCase();
    return mult * av.localeCompare(bv);
  }
  const av = Number(a[key]) || 0;
  const bv = Number(b[key]) || 0;
  return mult * (av - bv);
}

function sortReportRows(rows, sortKey, sortDir) {
  return [...rows].sort((a, b) => compareReportRows(a, b, sortKey, sortDir));
}

function SortableHeader({ label, columnKey, align, sortKey, sortDir, onSort }) {
  const active = sortKey === columnKey;
  const thAlign = align === "right" ? "text-right" : "text-left";
  const btnJustify = align === "right" ? "justify-end" : "justify-start";

  return (
    <th className={`px-4 py-3 ${thAlign}`} scope="col" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`inline-flex w-full items-center gap-1 uppercase tracking-wide hover:text-zinc-900 dark:hover:text-zinc-200 ${btnJustify}`}
      >
        <span>{label}</span>
        <span className="text-[10px] leading-none opacity-70" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export default function ReportsClient() {
  const [rangePreset, setRangePreset] = useState("today");
  const initialRange = getPresetRange("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [metricsScope, setMetricsScope] = useState("all");
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [loadedRange, setLoadedRange] = useState(null);
  const [sortKey, setSortKey] = useState(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState(DEFAULT_SORT_DIR);

  const sortedRows = useMemo(
    () => (rows.length ? sortReportRows(rows, sortKey, sortDir) : []),
    [rows, sortKey, sortDir],
  );

  function onSortColumn(columnKey) {
    if (sortKey === columnKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(columnKey);
    setSortDir(columnKey === "username" || columnKey === "role" ? "asc" : "desc");
  }

  function clearReport() {
    setLoadedRange(null);
    setRows([]);
    setTotals(null);
    setSortKey(DEFAULT_SORT_KEY);
    setSortDir(DEFAULT_SORT_DIR);
  }

  const loadReport = useCallback(async (fromDate, toDate, scope) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        fromDate,
        toDate,
        includeAllUsers: "1",
      });
      if (scope === "conference" || scope === "cold" || scope === "lead") {
        qs.set("scope", scope);
      }
      const res = await fetch(`/api/calls/metrics?${qs.toString()}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load report");
      setRows(json.metrics || []);
      setTotals(json.totals || null);
      setLoadedRange({ from: fromDate, to: toDate, scope });
    } catch (err) {
      setError(err.message || "Failed to load report");
      setRows([]);
      setTotals(null);
      setLoadedRange(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function applyPreset(preset) {
    setRangePreset(preset);
    clearReport();
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
  }

  async function onApplyRange(e) {
    e.preventDefault();
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    await loadReport(rangeFrom, rangeTo, metricsScope);
  }

  function onExportCsv(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!loadedRange || !rows.length || exporting) return;

    setExporting(true);
    try {
      const csvRows = sortedRows.map(metricsToCsvRow);
      if (totals) {
        csvRows.push([
          "TOTAL",
          "",
          totals.total,
          totals.completed,
          totals.noAnswer,
          totals.failedOrCanceled,
          totals.busy,
          formatDuration(totals.durationSeconds),
          totals.durationSeconds,
        ]);
      }
      const scopeLabel =
        loadedRange.scope === "conference"
          ? "conference"
          : loadedRange.scope === "cold"
            ? "cold-dial"
            : loadedRange.scope === "lead"
              ? "lead-calls"
              : "all-calls";
      const rangeLabel = `${loadedRange.from}_to_${loadedRange.to}`;
      downloadCsv(`user-report_${scopeLabel}_${rangeLabel}.csv`, CSV_HEADERS, csvRows);
    } finally {
      setExporting(false);
    }
  }

  const rangeLabel =
    loadedRange?.from && loadedRange?.to
      ? `${loadedRange.from} — ${loadedRange.to}`
      : "Select dates and click Apply";

  return (
    <div className="space-y-6">
      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900/40 dark:bg-zinc-900">
        <form className="grid gap-4" onSubmit={onApplyRange}>
          <div className="sm:col-span-3">
            <label className={labelClass}>Date range</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "week", label: "Last 7 days" },
                { id: "month", label: "This month" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    rangePreset === p.id
                      ? "border-amber-600 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="report-from-date" className={labelClass}>
                From date
              </label>
              <input
                id="report-from-date"
                type="date"
                className={inputClass}
                value={rangeFrom}
                onChange={(e) => {
                  setRangePreset("custom");
                  clearReport();
                  setRangeFrom(e.target.value);
                }}
                required
              />
            </div>
            <div>
              <label htmlFor="report-to-date" className={labelClass}>
                To date
              </label>
              <input
                id="report-to-date"
                type="date"
                className={inputClass}
                value={rangeTo}
                onChange={(e) => {
                  setRangePreset("custom");
                  clearReport();
                  setRangeTo(e.target.value);
                }}
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={loading}
                className="h-11 flex-1 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Apply"}
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Call scope</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  clearReport();
                  setMetricsScope("all");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  metricsScope === "all"
                    ? "border-amber-600 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                All calls
              </button>
              <button
                type="button"
                onClick={() => {
                  clearReport();
                  setMetricsScope("cold");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  metricsScope === "cold"
                    ? "border-amber-600 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Cold dial
              </button>
              <button
                type="button"
                onClick={() => {
                  clearReport();
                  setMetricsScope("lead");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  metricsScope === "lead"
                    ? "border-amber-600 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Lead calls
              </button>
              <button
                type="button"
                onClick={() => {
                  clearReport();
                  setMetricsScope("conference");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  metricsScope === "conference"
                    ? "border-amber-600 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Conference only
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">User activity</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {rangeLabel}
              {loadedRange
                ? loadedRange.scope === "conference"
                  ? " · conference calls"
                  : loadedRange.scope === "cold"
                    ? " · cold dial"
                    : loadedRange.scope === "lead"
                      ? " · lead calls"
                      : " · all calls"
                : null}
              {rows.length ? ` · ${rows.length} users` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!loadedRange || !rows.length || loading || exporting}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
              <tr>
                <SortableHeader
                  label="User"
                  columnKey="username"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="Role"
                  columnKey="role"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="Total"
                  columnKey="total"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="Completed"
                  columnKey="completed"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="No answer"
                  columnKey="noAnswer"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="Failed"
                  columnKey="failedOrCanceled"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="Busy"
                  columnKey="busy"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
                <SortableHeader
                  label="Duration"
                  columnKey="durationSeconds"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSortColumn}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-600 dark:text-zinc-300">
                    Loading report…
                  </td>
                </tr>
              ) : !loadedRange ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-600 dark:text-zinc-300">
                    Choose a date range and click Apply to view the report.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-600 dark:text-zinc-300">
                    No users to show for this range.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.userId} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {row.username}
                    </td>
                    <td className="px-4 py-3 capitalize text-zinc-700 dark:text-zinc-300">{row.role}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.completed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.noAnswer}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.failedOrCanceled}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.busy}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatDuration(row.durationSeconds)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {totals && rows.length > 0 && !loading ? (
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-600 dark:bg-zinc-950/60">
                <tr>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.total}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.completed}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.noAnswer}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.failedOrCanceled}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.busy}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatDuration(totals.durationSeconds)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}
