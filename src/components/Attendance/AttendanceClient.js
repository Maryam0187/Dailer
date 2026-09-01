"use client";

import { Fragment, useEffect, useState } from "react";
import DateRangeFilter, { getPresetRange } from "@/components/DateRangeFilter";

const tableClass = "min-w-full text-left text-sm";
const thClass =
  "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const tdClass = "px-3 py-2 text-zinc-800 dark:text-zinc-200";

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function tierBadge(day) {
  if (day.status === "on_leave") {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">On leave</span>;
  }
  if (day.status === "absent") {
    return <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Absent</span>;
  }
  if (day.status === "exempt") {
    return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">Exempt</span>;
  }
  if (day.tierKey === "full") {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">On time 100%</span>;
  }
  if (day.tierKey === "tier_90") {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">90%</span>;
  }
  if (day.pointPercent === 0) {
    return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">0%</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{day.pointPercent}%</span>;
}

function GamificationHero({ gamification, tierLegend }) {
  if (!gamification) return null;

  const nextBadge = gamification.badges?.find((b) => !b.earned);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total points
          </p>
          <p className="text-4xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
            {gamification.totalPoints}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Current streak
          </p>
          <p className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {gamification.currentOnTimeStreak} days
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Best streak
          </p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
            {gamification.longestOnTimeStreak}
          </p>
        </div>
      </div>

      {tierLegend?.shiftStartLabel ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Shift starts at <strong>{tierLegend.shiftStartLabel}</strong>. Point tiers by login time:
        </p>
      ) : null}

      {tierLegend?.tierDeadlines?.length ? (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {tierLegend.tierDeadlines.map((row) => (
            <li
              key={row.minutesAfterStart}
              className="rounded-lg border border-zinc-200 px-2 py-1 dark:border-zinc-700"
            >
              {row.label}: {row.percent}%
            </li>
          ))}
        </ul>
      ) : null}

      {nextBadge ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Next badge: <strong>{nextBadge.label}</strong>
        </p>
      ) : null}

      {gamification.badges?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {gamification.badges.map((badge) => (
            <span
              key={badge.badgeKey}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                badge.earned
                  ? "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
              }`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
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

function DailyTable({ days, userId, isAdmin, onSaved }) {
  const [expanded, setExpanded] = useState(null);
  const [loginCache, setLoginCache] = useState({});
  const [loginLoading, setLoginLoading] = useState(null);

  async function loadLoginsForDay(date) {
    if (loginCache[date]) return;
    setLoginLoading(date);
    try {
      const params = new URLSearchParams({ date });
      if (isAdmin && userId) params.set("userId", String(userId));
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
            <th className={thClass}>Date</th>
            <th className={thClass}>First login</th>
            <th className={thClass}>Device</th>
            <th className={thClass}>Office fingerprint</th>
            <th className={thClass}>Tier</th>
            <th className={thClass}>Points</th>
            <th className={thClass}>Logins</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {days.map((day) => (
            <Fragment key={day.date}>
              <tr
                className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                onClick={() => void toggleDay(day.date)}
              >
                <td className={tdClass}>{day.date}</td>
                <td className={tdClass}>{formatTime(day.firstLoginAt)}</td>
                <td className={tdClass}>{formatDevice(day.firstLoginDeviceLabel)}</td>
                <td className={tdClass}>
                  <OfficeFingerprintCell
                    day={day}
                    userId={userId}
                    isAdmin={isAdmin}
                    onSaved={onSaved}
                  />
                </td>
                <td className={tdClass}>{tierBadge(day)}</td>
                <td className={tdClass}>{day.pointsEarned ?? 0}</td>
                <td className={tdClass}>{day.loginCount}</td>
              </tr>
              {expanded === day.date ? (
                <tr>
                  <td colSpan={7} className="bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900/30">
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

export default function AttendanceClient({ isAdmin, users = [] }) {
  const initialRange = getPresetRange("week");
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminTab, setAdminTab] = useState("summary");
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? null);

  useEffect(() => {
    if (isAdmin && users.length > 0 && !selectedUserId) {
      setSelectedUserId(users[0].id);
    }
  }, [isAdmin, users, selectedUserId]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [detail, setDetail] = useState(null);

  async function reloadDetail() {
    const params = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
    if (isAdmin && adminTab === "detail" && selectedUserId) {
      params.set("userId", String(selectedUserId));
    }
    const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setDetail(json);
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        if (isAdmin && adminTab === "summary") {
          const params = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
          const res = await fetch(`/api/attendance/summary?${params}`, { credentials: "include" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Failed to load summary");
          if (!cancelled) setSummaryRows(json.users || []);
        } else if (isAdmin) {
          if (!selectedUserId) {
            if (!cancelled) setLoading(false);
            return;
          }
          const params = new URLSearchParams({
            fromDate: appliedFrom,
            toDate: appliedTo,
            userId: String(selectedUserId),
          });
          const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Failed to load detail");
          if (!cancelled) setDetail(json);
        } else {
          const params = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
          const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Failed to load attendance");
          if (!cancelled) setDetail(json);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, adminTab, selectedUserId, appliedFrom, appliedTo]);

  function applyRange() {
    setAppliedFrom(from);
    setAppliedTo(to);
  }

  const tierLegend = detail?.tierLegend ?? detail?.gamification?.tierLegend;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <DateRangeFilter
            preset={preset}
            from={from}
            to={to}
            onChange={({ preset: p, from: f, to: t }) => {
              setPreset(p);
              setFrom(f);
              setTo(t);
            }}
          />
        </div>
        <button
          type="button"
          onClick={applyRange}
          className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Apply
        </button>
      </div>

      {isAdmin ? (
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
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

      {isAdmin && adminTab === "summary" && !loading ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className={tableClass}>
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
              <tr>
                <th className={thClass}>User</th>
                <th className={thClass}>100%</th>
                <th className={thClass}>90%</th>
                <th className={thClass}>Partial</th>
                <th className={thClass}>0%</th>
                <th className={thClass}>Absent</th>
                <th className={thClass}>Points</th>
                <th className={thClass}>Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {summaryRows.map((row) => (
                <tr
                  key={row.userId}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  onClick={() => {
                    setSelectedUserId(row.userId);
                    setAdminTab("detail");
                  }}
                >
                  <td className={tdClass}>{row.username}</td>
                  <td className={tdClass}>{row.daysFullPoints}</td>
                  <td className={tdClass}>{row.daysTier90}</td>
                  <td className={tdClass}>{row.daysPartialPoints}</td>
                  <td className={tdClass}>{row.daysZeroPoints}</td>
                  <td className={tdClass}>{row.daysAbsent}</td>
                  <td className={tdClass}>{row.totalPoints}</td>
                  <td className={tdClass}>{row.currentStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isAdmin && adminTab === "detail" ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">User</label>
          <select
            value={selectedUserId ?? ""}
            onChange={(e) => setSelectedUserId(Number(e.target.value))}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
      ) : null}

      {((isAdmin && adminTab === "detail" && !loading && detail) ||
        (!isAdmin && !loading && detail)) && (
        <>
          <GamificationHero gamification={detail.gamification} tierLegend={detail.tierLegend} />
          <DailyTable
            days={detail.days || []}
            userId={detail.userId}
            isAdmin={isAdmin && adminTab === "detail"}
            onSaved={reloadDetail}
          />
        </>
      )}
    </div>
  );
}
