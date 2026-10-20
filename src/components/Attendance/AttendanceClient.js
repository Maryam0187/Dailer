"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getPresetRange } from "@/components/DateRangeFilter";
import AttendancePeriodStats, {
  presentAbsentFromDays,
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
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const tableClass = "min-w-full text-left text-sm";
const thClass =
  "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 align-middle";
const tdClass = "px-3 py-2 align-middle text-zinc-800 dark:text-zinc-200";
const tdClassRight = `${tdClass} text-right tabular-nums whitespace-nowrap`;

const TEXT_SORT_KEYS = new Set([
  "username",
  "shiftKey",
  "locationLabel",
  "firstLoginDeviceLabel",
  "date",
]);

function compareAttendanceValue(a, b, key, dir) {
  const mult = dir === "asc" ? 1 : -1;

  if (key === "firstLoginAt" || key === "officeFingerprintAt") {
    const av = a[key] ? new Date(a[key]).getTime() : null;
    const bv = b[key] ? new Date(b[key]).getTime() : null;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return mult * (av - bv);
  }

  if (key === "tierSort") {
    const av = tierSortValue(a);
    const bv = tierSortValue(b);
    if (av !== bv) return mult * (av - bv);
    return mult * String(a.date ?? "").localeCompare(String(b.date ?? ""));
  }

  if (TEXT_SORT_KEYS.has(key)) {
    const av = String(a[key] ?? "").toLowerCase();
    const bv = String(b[key] ?? "").toLowerCase();
    return mult * av.localeCompare(bv);
  }

  const av = Number(a[key]) || 0;
  const bv = Number(b[key]) || 0;
  if (av !== bv) return mult * (av - bv);
  return String(a.username ?? a.date ?? "").localeCompare(String(b.username ?? b.date ?? ""));
}

function sortAttendanceRows(rows, sortKey, sortDir) {
  return [...rows].sort((a, b) => compareAttendanceValue(a, b, sortKey, sortDir));
}

function tierSortValue(day) {
  if (day.status === "on_leave") return -3;
  if (day.status === "exempt") return -2;
  if (day.status === "absent") return -1;
  if (day.status === "half_leave") return 0;
  return 1;
}

function useTableSort(defaultKey, defaultDir = "desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);

  function onSort(columnKey) {
    if (sortKey === columnKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(columnKey);
    setSortDir(TEXT_SORT_KEYS.has(columnKey) ? "asc" : "desc");
  }

  return { sortKey, sortDir, onSort };
}

function SortableHeader({ label, columnKey, sortKey, sortDir, onSort, align = "left", className = "" }) {
  const active = sortKey === columnKey;
  const isRight = align === "right";

  return (
    <th
      className={`${thClass} ${isRight ? "text-right" : "text-left"} ${className}`}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`flex w-full items-center gap-1 whitespace-nowrap hover:text-zinc-800 dark:hover:text-zinc-200 ${
          isRight ? "justify-end text-right tabular-nums" : "justify-start text-left"
        } ${active ? "text-emerald-700 dark:text-emerald-400" : ""}`}
      >
        <span>{label}</span>
        <span className="shrink-0 text-[10px] leading-none opacity-60" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function StaticHeader({ label, align = "left", className = "" }) {
  const isRight = align === "right";
  return (
    <th
      className={`${thClass} ${isRight ? "text-right tabular-nums" : "text-left"} ${className}`}
    >
      {label}
    </th>
  );
}

const SHIFT_FILTER_OPTIONS = [
  { id: "all", label: "All shifts" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
];

const LOCATION_FILTER_OPTIONS = [
  { id: "all", label: "Combined" },
  { id: "in_house", label: "In-house" },
  { id: "outside", label: "Outside" },
];

const selectClass =
  "h-10 min-w-[10rem] rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";

function usersForFilters(users, shiftFilter, locationFilter) {
  return users.filter((u) => {
    if (shiftFilter !== "all" && u.shiftKey !== shiftFilter) return false;
    if (locationFilter === "outside" && !u.isOutside) return false;
    if (locationFilter === "in_house" && u.isOutside) return false;
    return true;
  });
}

function shiftLabel(shiftKey) {
  return shiftKey === "night" ? "Night" : "Day";
}

function locationLabel(isOutside) {
  return isOutside ? "Outside" : "In-house";
}

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

function statusBadge(day) {
  if (day.status === "on_leave") {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">On leave</span>;
  }
  if (day.status === "absent") {
    return <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Absent</span>;
  }
  if (day.status === "exempt") {
    return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">Exempt</span>;
  }
  if (day.status === "half_leave") {
    return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">Half leave</span>;
  }
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">Present</span>;
}

const STATUS_OVERRIDE_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "half_leave", label: "Half leave" },
  { value: "on_leave", label: "Leave" },
  { value: "absent", label: "Absent" },
];

function StatusOverrideCell({ day, userId, canEditStatus, onSaved }) {
  const [value, setValue] = useState(() => day.statusOverride || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(day.statusOverride || "");
  }, [day.statusOverride, day.date]);

  if (!canEditStatus) {
    return statusBadge(day);
  }

  async function save(next) {
    setSaving(true);
    try {
      const res = await fetch("/api/attendance/status-override", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          calendarDate: day.date,
          statusOverride: next || null,
        }),
      });
      if (res.ok) {
        setValue(next);
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-[9rem] space-y-1" onClick={(e) => e.stopPropagation()}>
      {statusBadge(day)}
      <select
        value={value}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
        aria-label={`Set attendance status for ${day.date}`}
      >
        {STATUS_OVERRIDE_OPTIONS.map((opt) => (
          <option key={opt.value || "auto"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {value ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Manual override</p>
      ) : (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Auto from online time</p>
      )}
    </div>
  );
}

function formatDevice(label) {
  if (!label || label === "Unknown") return "—";
  return label;
}

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function OfficeFingerprintCell({ day, userId, isAdmin, onSaved }) {
  const [value, setValue] = useState(() => toDatetimeLocalValue(day.officeFingerprintAt));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(toDatetimeLocalValue(day.officeFingerprintAt));
  }, [day.officeFingerprintAt]);

  if (!isAdmin) {
    return <span>{formatTime(day.officeFingerprintAt)}</span>;
  }

  async function save(clear = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/attendance/office-fingerprint", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          calendarDate: day.date,
          officeFingerprintAt: clear ? null : value ? new Date(value).toISOString() : null,
        }),
      });
      if (res.ok) {
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-[11rem]" onClick={(e) => e.stopPropagation()}>
          <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        aria-label={`Office fingerprint time for ${day.date}`}
      />
      <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        Points use this time when saved
      </p>
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          disabled={saving || !value}
          onClick={() => void save(false)}
          className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        {day.officeFingerprintAt ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-semibold dark:border-zinc-600"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DailyTable({ days, userId, isAdmin, canEditStatus, onSaved }) {
  const [expanded, setExpanded] = useState(null);
  const [loginCache, setLoginCache] = useState({});
  const [loginLoading, setLoginLoading] = useState(null);
  const { sortKey, sortDir, onSort } = useTableSort("date", "desc");

  const sortedDays = useMemo(
    () => sortAttendanceRows(days, sortKey, sortDir),
    [days, sortKey, sortDir],
  );

  async function loadLoginsForDay(date) {
    if (loginCache[date]) return;
    setLoginLoading(date);
    try {
      const params = new URLSearchParams({ date });
      if ((isAdmin || canEditStatus) && userId) params.set("userId", String(userId));
      const res = await fetch(`/api/attendance/logins?${params}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setLoginCache((prev) => ({ ...prev, [date]: json.logins || [] }));
      }
    } finally {
      setLoginLoading(null);
    }
  }

  async function toggleDay(date) {
    if (expanded === date) {
      setExpanded(null);
      return;
    }
    setExpanded(date);
    await loadLoginsForDay(date);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <table className={tableClass}>
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <tr>
            <SortableHeader label="Date" columnKey="date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableHeader label="First login" columnKey="firstLoginAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableHeader label="Device" columnKey="firstLoginDeviceLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <StaticHeader label="Office fingerprint" className="min-w-[11rem]" />
            <SortableHeader label="Status" columnKey="tierSort" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortableHeader label="Desktop" columnKey="desktopOnlineMs" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <SortableHeader label="Mobile" columnKey="mobileOnlineMs" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <SortableHeader label="Online time" columnKey="onlineMs" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <SortableHeader label="Logins" columnKey="loginCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sortedDays.map((day) => (
            <Fragment key={day.date}>
              <tr
                className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                onClick={() => void toggleDay(day.date)}
              >
                <td className={tdClass}>{day.date}</td>
                <td className={`${tdClass} tabular-nums`}>{formatTime(day.firstLoginAt)}</td>
                <td className={tdClass}>{formatDevice(day.firstLoginDeviceLabel)}</td>
                <td className={`${tdClass} min-w-[11rem]`}>
                  <OfficeFingerprintCell
                    day={day}
                    userId={userId}
                    isAdmin={isAdmin}
                    onSaved={onSaved}
                  />
                </td>
                <td className={tdClass}>
                  <StatusOverrideCell
                    day={day}
                    userId={userId}
                    canEditStatus={canEditStatus}
                    onSaved={onSaved}
                  />
                </td>
                <td className={tdClassRight}>{formatOnlineMs(Number(day.desktopOnlineMs) || 0)}</td>
                <td className={tdClassRight}>{formatOnlineMs(Number(day.mobileOnlineMs) || 0)}</td>
                <td className={tdClassRight}>{formatOnlineMs(Number(day.onlineMs) || 0)}</td>
                <td className={tdClassRight}>{day.loginCount}</td>
              </tr>
              {expanded === day.date ? (
                <tr>
                  <td colSpan={9} className="bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900/30">
                    {loginLoading === day.date ? (
                      <p>Loading logins…</p>
                    ) : (loginCache[day.date]?.length ?? day.logins?.length ?? 0) === 0 ? (
                      <p>No login events</p>
                    ) : (
                      <ul className="space-y-1">
                        {(loginCache[day.date] ?? day.logins ?? []).map((login) => (
                          <li key={login.id}>
                            {formatTime(login.createdAt)} — {login.deviceLabel || "Unknown"} —{" "}
                            {login.location || "Unknown location"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AttendanceClient({ isAdmin, canEditStatus = false, users = [] }) {
  const canManage = isAdmin || canEditStatus;
  const initialRange = getPresetRange("today");
  const [preset, setPreset] = useState("today");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [shiftFilter, setShiftFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [adminTab, setAdminTab] = useState("summary");
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? null);
  const [summaryRows, setSummaryRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const { sortKey: summarySortKey, sortDir: summarySortDir, onSort: onSummarySort } = useTableSort(
    "totalOnlineMs",
    "desc",
  );

  const detailRangeStats = useMemo(
    () => presentAbsentFromDays(detail?.days || []),
    [detail?.days],
  );

  const sortedSummaryRows = useMemo(
    () =>
      sortAttendanceRows(
        summaryRows.map((row) => ({
          ...row,
          locationLabel: locationLabel(row.isOutside),
        })),
        summarySortKey,
        summarySortDir,
      ),
    [summaryRows, summarySortKey, summarySortDir],
  );

  const summaryTotals = useMemo(() => {
    let present = 0;
    let absent = 0;
    for (const row of sortedSummaryRows) {
      // Present = at least one desktop login in the selected range.
      if ((Number(row.totalLogins) || 0) > 0) present += 1;
      else absent += 1;
    }
    return {
      totalUsers: sortedSummaryRows.length,
      present,
      absent,
    };
  }, [sortedSummaryRows]);

  const filteredUsers = usersForFilters(users, shiftFilter, locationFilter);

  useEffect(() => {
    if (!canManage) return;
    const list = usersForFilters(users, shiftFilter, locationFilter);
    if (list.length === 0) return;
    if (!selectedUserId || !list.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(list[0].id);
    }
  }, [canManage, users, shiftFilter, locationFilter, selectedUserId]);

  const loadAttendance = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        if (canManage && adminTab === "summary") {
          const params = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
          if (shiftFilter === "day" || shiftFilter === "night") {
            params.set("shiftKey", shiftFilter);
          }
          if (isAdmin && (locationFilter === "in_house" || locationFilter === "outside")) {
            params.set("location", locationFilter);
          }
          const res = await fetch(`/api/attendance/summary?${params}`, { credentials: "include" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Failed to load summary");
          setSummaryRows(json.users || []);
        } else if (canManage) {
          if (!selectedUserId) return;
          const params = new URLSearchParams({
            fromDate: appliedFrom,
            toDate: appliedTo,
            userId: String(selectedUserId),
          });
          const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Failed to load detail");
          setDetail(json);
        } else {
          const params = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
          const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Failed to load attendance");
          setDetail(json);
        }
      } catch (err) {
        setError(err.message || "Failed to load");
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [
      canManage,
      isAdmin,
      adminTab,
      selectedUserId,
      appliedFrom,
      appliedTo,
      shiftFilter,
      locationFilter,
    ],
  );

  async function reloadDetail() {
    await loadAttendance({ silent: true });
  }

  async function refreshAll({ silent = true } = {}) {
    await loadAttendance({ silent });
  }

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

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

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <label className={labelClass}>Date range</label>
          <div className="flex flex-wrap items-end gap-2">
            {RANGE_PRESET_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
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
                <div>
                  <label htmlFor="attendance-from-date" className="sr-only">
                    From date
                  </label>
                  <input
                    id="attendance-from-date"
                    type="date"
                    className={`${dateInputClass} w-[9.5rem]`}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="attendance-to-date" className="sr-only">
                    To date
                  </label>
                  <input
                    id="attendance-to-date"
                    type="date"
                    className={`${dateInputClass} w-[9.5rem]`}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={onApplyRange}
                  disabled={loading || refreshing || !from || !to || from > to}
                  className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Apply range
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Location
            <select
              className={`${selectClass} mt-1.5 block`}
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              aria-label="Filter by location"
            >
              {LOCATION_FILTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Shift
            <select
              className={`${selectClass} mt-1.5 block`}
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              aria-label="Filter by shift"
            >
              {SHIFT_FILTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdminTab("summary")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                adminTab === "summary"
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              All users
            </button>
            <button
              type="button"
              onClick={() => setAdminTab("detail")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                adminTab === "detail"
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              User detail
            </button>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll({ silent: true })}
            disabled={loading || refreshing || !appliedFrom || !appliedTo}
            className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void refreshAll({ silent: true })}
            disabled={loading || refreshing || !appliedFrom || !appliedTo}
            className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

      {canManage && adminTab === "summary" && !loading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Total users
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                {summaryTotals.totalUsers}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Present
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                {summaryTotals.present}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                Absent
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-rose-900 dark:text-rose-100">
                {summaryTotals.absent}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <table className={tableClass}>
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                <tr>
                  <SortableHeader label="User" columnKey="username" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} />
                  <SortableHeader label="Location" columnKey="locationLabel" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} />
                  <SortableHeader label="Shift" columnKey="shiftKey" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} />
                  <SortableHeader label="First login" columnKey="firstLoginAt" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} />
                  <SortableHeader label="Absent" columnKey="daysAbsent" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} align="right" />
                  <SortableHeader label="Logins" columnKey="totalLogins" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} align="right" />
                  <SortableHeader label="Desktop" columnKey="totalDesktopOnlineMs" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} align="right" />
                  <SortableHeader label="Mobile" columnKey="totalMobileOnlineMs" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} align="right" />
                  <SortableHeader label="Online time" columnKey="totalOnlineMs" sortKey={summarySortKey} sortDir={summarySortDir} onSort={onSummarySort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {sortedSummaryRows.map((row) => (
                  <tr
                    key={row.userId}
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    onClick={() => {
                      setSelectedUserId(row.userId);
                      setAdminTab("detail");
                    }}
                  >
                    <td className={tdClass}>{row.username}</td>
                    <td className={tdClass}>{row.locationLabel}</td>
                    <td className={tdClass}>{shiftLabel(row.shiftKey)}</td>
                    <td className={`${tdClass} tabular-nums`}>{formatTime(row.firstLoginAt)}</td>
                    <td className={tdClassRight}>{row.daysAbsent}</td>
                    <td className={tdClassRight}>{row.totalLogins}</td>
                    <td className={tdClassRight}>{formatOnlineMs(Number(row.totalDesktopOnlineMs) || 0)}</td>
                    <td className={tdClassRight}>{formatOnlineMs(Number(row.totalMobileOnlineMs) || 0)}</td>
                    <td className={tdClassRight}>{formatOnlineMs(Number(row.totalOnlineMs) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {canManage && adminTab === "detail" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">User</label>
            <select
              value={selectedUserId ?? ""}
              onChange={(e) => setSelectedUserId(Number(e.target.value))}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({locationLabel(u.isOutside)} · {shiftLabel(u.shiftKey)})
                </option>
              ))}
            </select>
          </div>
          <AttendancePeriodStats
            present={detailRangeStats.present}
            absent={detailRangeStats.absent}
            leave={detailRangeStats.leave}
            fromDate={appliedFrom}
            toDate={appliedTo}
            loading={loading && !detail}
          />
        </div>
      ) : null}

      {((canManage && adminTab === "detail" && !loading && detail) ||
        (!canManage && !loading && detail)) && (
        <>
          {!canManage ? (
            <AttendancePeriodStats
              present={detailRangeStats.present}
              absent={detailRangeStats.absent}
              leave={detailRangeStats.leave}
              fromDate={appliedFrom}
              toDate={appliedTo}
            />
          ) : null}
          <DailyTable
            days={detail.days || []}
            userId={detail.userId}
            isAdmin={isAdmin && adminTab === "detail"}
            canEditStatus={canEditStatus && adminTab === "detail"}
            onSaved={reloadDetail}
          />
        </>
      )}
    </div>
  );
}
