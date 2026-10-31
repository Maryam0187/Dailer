"use client";

import { useEffect, useState } from "react";
import AttendanceStatusBadge from "@/components/Attendance/AttendanceStatusBadge";
import ReportLoader from "@/components/UserReports/ReportLoader";

const MANUAL_STATUS_OPTIONS = [
  { value: "present", label: "Present", color: "present" },
  { value: "half_leave", label: "Half leave", color: "half_leave" },
  { value: "on_leave", label: "Leave", color: "on_leave" },
  { value: "absent", label: "Absent", color: "absent" },
];

const FIELD_COLOR_CLASS = {
  present:
    "border-emerald-300 bg-emerald-100 font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  absent:
    "border-rose-300 bg-rose-100 font-semibold text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  half_leave:
    "border-orange-300 bg-orange-100 font-semibold text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
  on_leave:
    "border-amber-300 bg-amber-100 font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  auto: "border-zinc-200 bg-white font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
};

const OPTION_STYLE = {
  present: { color: "#065f46", backgroundColor: "#d1fae5", fontWeight: 600 },
  absent: { color: "#9f1239", backgroundColor: "#ffe4e6", fontWeight: 600 },
  half_leave: { color: "#9a3412", backgroundColor: "#ffedd5", fontWeight: 600 },
  on_leave: { color: "#92400e", backgroundColor: "#fef3c7", fontWeight: 600 },
  auto: { color: "#3f3f46", backgroundColor: "#f4f4f5", fontWeight: 600 },
};

/** Closed field label when this status is automatic. Not saved. */
const AUTO_STATUS_LABELS = {
  present: "Present",
  half_leave: "Half leave",
  on_leave: "Leave",
  absent: "Absent",
};

/** Shown in the closed field for an automatic Present or Absent. Not saved. */
const AUTO_STATUS_DISPLAY = "__auto_status_display";
/** Dropdown row “Present (auto)” or “Absent (auto)”. Saves the same clear as Auto. */
const AUTO_STATUS_OPTION = "__auto_status";

export default function StatusOverrideCell({ day, userId, canEditStatus, onSaved }) {
  const [value, setValue] = useState(() => day.statusOverride || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(day.statusOverride || "");
  }, [day.statusOverride, day.date]);

  if (!canEditStatus) {
    return <AttendanceStatusBadge day={day} />;
  }

  const autoStatusLabel = !value ? AUTO_STATUS_LABELS[day.status] : null;
  const fieldColor = value || (autoStatusLabel ? day.status : "auto");

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
    <div className="min-w-[9rem]" onClick={(e) => e.stopPropagation()}>
      <select
        value={autoStatusLabel ? AUTO_STATUS_DISPLAY : value}
        disabled={saving}
        onChange={(e) => {
          const next = e.target.value;
          if (next === AUTO_STATUS_DISPLAY || next === AUTO_STATUS_OPTION) {
            if (value) void save("");
            return;
          }
          if (next !== value) void save(next);
        }}
        className={`w-full rounded-lg border px-2 py-1 text-xs ${FIELD_COLOR_CLASS[fieldColor] || FIELD_COLOR_CLASS.auto}`}
        aria-label={`Set attendance status for ${day.date}`}
      >
        {autoStatusLabel ? (
          <option value={AUTO_STATUS_DISPLAY} hidden style={OPTION_STYLE[day.status] || OPTION_STYLE.auto}>
            {autoStatusLabel}
          </option>
        ) : null}
        <option
          value={autoStatusLabel ? AUTO_STATUS_OPTION : ""}
          style={autoStatusLabel ? OPTION_STYLE[day.status] || OPTION_STYLE.auto : OPTION_STYLE.auto}
        >
          {autoStatusLabel ? `${autoStatusLabel} (auto)` : "Auto"}
        </option>
        {MANUAL_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={OPTION_STYLE[opt.color]}>
            {opt.label}
          </option>
        ))}
      </select>
      {saving ? <ReportLoader label="Saving status…" compact /> : null}
    </div>
  );
}
