"use client";

import { useCallback, useEffect, useState } from "react";
import { getPresetRange } from "@/components/DateRangeFilter";
import AttendancePeriodStats, {
  presentAbsentFromDays,
  presentAbsentFromSummary,
} from "@/components/Attendance/AttendancePeriodStats";

const RANGE_PRESET_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const dateInputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
const tableClass = "min-w-full text-left text-sm";
const thClass =
  "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const tdClass = "px-3 py-2 align-middle text-zinc-800 dark:text-zinc-200";

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatOnlineMs(value) {
  const ms = Number(value) || 0;
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function countsFromPayload(json) {
  if (json?.summary) return presentAbsentFromSummary(json.summary);
  return presentAbsentFromDays(json?.days);
}

async function fetchSelfAttendance(fromDate, toDate) {
  const params = new URLSearchParams({ fromDate, toDate });
  const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load attendance");
  return json;
}

export default function ProfileAttendanceClient() {
  const initialRange = getPresetRange("week");
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [days, setDays] = useState([]);
  const [weekStats, setWeekStats] = useState({ present: 0, absent: 0 });
  const [monthStats, setMonthStats] = useState({ present: 0, absent: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadPeriodStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const weekRange = getPresetRange("week");
      const monthRange = getPresetRange("month");
      const [weekJson, monthJson] = await Promise.all([
        fetchSelfAttendance(weekRange.from, weekRange.to),
        fetchSelfAttendance(monthRange.from, monthRange.to),
      ]);
      setWeekStats(countsFromPayload(weekJson));
      setMonthStats(countsFromPayload(monthJson));
    } catch (err) {
      setError(err.message || "Failed to load present / absent");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadTable = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const json = await fetchSelfAttendance(appliedFrom, appliedTo);
        const list = Array.isArray(json.days) ? [...json.days] : [];
        list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        setDays(list);
      } catch (err) {
        setError(err.message || "Failed to load attendance");
        setDays([]);
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [appliedFrom, appliedTo],
  );

  useEffect(() => {
    void loadPeriodStats();
  }, [loadPeriodStats]);

  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  function applyPreset(nextPreset) {
    setPreset(nextPreset);
    setError(null);
    if (nextPreset === "custom") return;
    const next = getPresetRange(nextPreset);
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

  async function onRefresh() {
    await Promise.all([loadPeriodStats(), loadTable({ silent: true })]);
  }

  return (
    <div className="space-y-4">
      <AttendancePeriodStats week={weekStats} month={monthStats} loading={statsLoading} />

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
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading || refreshing || statsLoading}
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
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className={tableClass}>
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
              <tr>
                <th className={`${thClass} px-4`}>Date</th>
                <th className={`${thClass} px-4`}>First login</th>
                <th className={`${thClass} px-4 text-right`}>Online time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {days.length === 0 ? (
                <tr>
                  <td colSpan={3} className={`${tdClass} px-4 py-6 text-center text-zinc-500`}>
                    No attendance records for this range.
                  </td>
                </tr>
              ) : (
                days.map((day) => (
                  <tr
                    key={day.date}
                    className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                  >
                    <td className={`${tdClass} px-4`}>{day.date}</td>
                    <td className={`${tdClass} px-4 tabular-nums`}>{formatTime(day.firstLoginAt)}</td>
                    <td className={`${tdClass} px-4 text-right tabular-nums`}>
                      {formatOnlineMs(day.onlineMs)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
