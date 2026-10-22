"use client";

import { REPORT_EASTERN_TODAY_NOTICE, getReportPresetRange } from "@/lib/attendanceTime";

export const DATE_RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

export function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today / week / month in US Eastern (matches server REPORT_TIMEZONE). */
export function getPresetRange(preset) {
  return getReportPresetRange(preset);
}

const defaultSelectClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const defaultLabelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/**
 * Controlled date-range filter with presets + custom from/to.
 * onChange({ preset, from, to })
 */
export default function DateRangeFilter({
  preset,
  from,
  to,
  onChange,
  idPrefix = "date-range",
  selectClassName = defaultSelectClass,
  inputClassName = defaultSelectClass,
  labelClassName = defaultLabelClass,
  showLabels = true,
}) {
  function emit(next) {
    onChange?.({
      preset: next.preset ?? preset,
      from: next.from ?? from,
      to: next.to ?? to,
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:min-w-[180px] sm:w-44">
          {showLabels ? (
            <label htmlFor={`${idPrefix}-preset`} className={labelClassName}>
              Date range
            </label>
          ) : null}
          <select
            id={`${idPrefix}-preset`}
            value={preset}
            onChange={(e) => {
              const nextPreset = e.target.value;
              if (nextPreset === "custom") {
                emit({ preset: "custom" });
                return;
              }
              const range = getPresetRange(nextPreset);
              emit({ preset: nextPreset, from: range.from, to: range.to });
            }}
            className={selectClassName}
          >
            {DATE_RANGE_PRESETS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "custom" ? (
          <>
            <div className="w-full sm:w-40">
              {showLabels ? (
                <label htmlFor={`${idPrefix}-from`} className={labelClassName}>
                  From
                </label>
              ) : null}
              <input
                id={`${idPrefix}-from`}
                type="date"
                value={from || ""}
                onChange={(e) => emit({ preset: "custom", from: e.target.value })}
                className={inputClassName}
              />
            </div>
            <div className="w-full sm:w-40">
              {showLabels ? (
                <label htmlFor={`${idPrefix}-to`} className={labelClassName}>
                  To
                </label>
              ) : null}
              <input
                id={`${idPrefix}-to`}
                type="date"
                value={to || ""}
                onChange={(e) => emit({ preset: "custom", to: e.target.value })}
                className={inputClassName}
              />
            </div>
          </>
        ) : null}
      </div>
      <p
        role="status"
        className="inline-flex max-w-full items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <span className="shrink-0 font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Note
        </span>
        <span>{REPORT_EASTERN_TODAY_NOTICE}</span>
      </p>
    </div>
  );
}
