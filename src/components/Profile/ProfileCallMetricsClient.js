"use client";

import { useCallback, useEffect, useState } from "react";
import { MetricStat } from "@/components/UserReports/userReportHelpers";
import { formatDuration } from "@/lib/formatDuration";
import {
  ATTENDANCE_EASTERN_TODAY_NOTICE,
  getAttendancePresetRange,
} from "@/lib/attendanceTime";

const RANGE_PRESET_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

const SCOPE_OPTIONS = [
  { id: "all", label: "All calls" },
  { id: "conference", label: "Conference calls" },
];

const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const dateInputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

async function fetchSelfMetrics(fromDate, toDate, scope) {
  const params = new URLSearchParams({ fromDate, toDate, scope });
  const res = await fetch(`/api/profile/metrics?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load call metrics");
  return {
    metrics: json.metrics || null,
    days: Array.isArray(json.days) ? json.days : [],
    daysTruncated: Boolean(json.daysTruncated),
  };
}

const tableClass = "min-w-full text-left text-sm";
const thClass =
  "whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const tdClass = "whitespace-nowrap px-3 py-2 align-middle text-zinc-800 dark:text-zinc-200";

export default function ProfileCallMetricsClient() {
  const initialRange = getAttendancePresetRange("week");
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [scope, setScope] = useState("all");
  const [metrics, setMetrics] = useState(null);
  const [days, setDays] = useState([]);
  const [daysTruncated, setDaysTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadMetrics = useCallback(
    async ({ silent = false } = {}) => {
      if (!appliedFrom || !appliedTo) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await fetchSelfMetrics(appliedFrom, appliedTo, scope);
        setMetrics(next.metrics);
        setDays(next.days);
        setDaysTruncated(next.daysTruncated);
      } catch (err) {
        setError(err.message || "Failed to load call metrics");
        setMetrics(null);
        setDays([]);
        setDaysTruncated(false);
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [appliedFrom, appliedTo, scope],
  );

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  function applyPreset(nextPreset) {
    setPreset(nextPreset);
    setError(null);
    if (nextPreset === "custom") return;
    const next = getAttendancePresetRange(nextPreset);
    setFrom(next.from);
    setTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
  }

  function onApplyRange() {
    if (preset !== "custom") return;
    if (!from || !to) {
      setError("From date and to date are required");
      return;
    }
    if (from > to) {
      setError("From date must be on or before to date");
      return;
    }
    setError(null);
    setAppliedFrom(from);
    setAppliedTo(to);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className={labelClass}>Date range</label>
            <div className="flex flex-wrap items-end gap-2">
              {RANGE_PRESET_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`h-9 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    preset === p.id
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {preset === "custom" ? (
                <>
                  <input
                    type="date"
                    className={`${dateInputClass} w-[9.5rem]`}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-label="From date"
                  />
                  <input
                    type="date"
                    className={`${dateInputClass} w-[9.5rem]`}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-label="To date"
                  />
                  <button
                    type="button"
                    onClick={onApplyRange}
                    className="h-9 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Apply
                  </button>
                </>
              ) : null}
            </div>
            <div className="mt-3">
              <label className={labelClass}>Call scope</label>
              <div className="flex flex-wrap gap-2">
                {SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScope(opt.id)}
                    className={`h-9 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      scope === opt.id
                        ? "border-violet-600 bg-violet-100 text-violet-950 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Outbound calls you placed in the selected date range.
              </p>
            </div>
            <p
              role="status"
              className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <span className="shrink-0 font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Note
              </span>
              <span>{ATTENDANCE_EASTERN_TODAY_NOTICE}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMetrics({ silent: true })}
            disabled={loading || refreshing || !appliedFrom || !appliedTo}
            className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricStat label="Total calls" value={metrics?.total ?? 0} />
          <MetricStat label="Completed" value={metrics?.completed ?? 0} />
          <MetricStat label="No answer" value={metrics?.noAnswer ?? 0} />
          <MetricStat label="Failed/Canceled" value={metrics?.failedOrCanceled ?? 0} />
          <MetricStat label="Busy" value={metrics?.busy ?? 0} />
          <MetricStat label="Total duration" value={formatDuration(metrics?.durationSeconds)} />
          <MetricStat
            label="Twilio / Zoom"
            value={`${formatDuration(metrics?.twilioDurationSeconds)} / ${formatDuration(metrics?.zoomDurationSeconds)}`}
          />
        </div>
      )}

      {!loading && appliedFrom && appliedTo && appliedFrom !== appliedTo ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">By day</h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {daysTruncated
                ? "Showing the latest 93 days in this range. Each row is one US Eastern day."
                : "One row per US Eastern day in this range, including days with no calls."}
            </p>
          </div>
          <table className={tableClass}>
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
              <tr>
                <th className={thClass}>Date</th>
                <th className={`${thClass} text-right`}>Calls</th>
                <th className={`${thClass} text-right`}>Completed</th>
                <th className={`${thClass} text-right`}>No answer</th>
                <th className={`${thClass} text-right`}>Failed/Canceled</th>
                <th className={`${thClass} text-right`}>Busy</th>
                <th className={`${thClass} text-right`}>Duration</th>
                <th className={`${thClass} text-right`}>Twilio</th>
                <th className={`${thClass} text-right`}>Zoom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {days.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${tdClass} px-4 py-6 text-center text-zinc-500`}>
                    No days in this range.
                  </td>
                </tr>
              ) : (
                days.map((day) => (
                  <tr key={day.date} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                    <td className={`${tdClass} font-medium`}>{day.date}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{day.total ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{day.completed ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{day.noAnswer ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {day.failedOrCanceled ?? 0}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{day.busy ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {formatDuration(day.durationSeconds)}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {formatDuration(day.twilioDurationSeconds)}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {formatDuration(day.zoomDurationSeconds)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {appliedFrom && appliedTo ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Showing {appliedFrom}
          {appliedFrom !== appliedTo ? ` → ${appliedTo}` : ""} (US Eastern)
        </p>
      ) : null}
    </div>
  );
}
