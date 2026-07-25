"use client";

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

export function getPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    const d = formatDateInput(today);
    return { from: d, to: d };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = formatDateInput(y);
    return { from: d, to: d };
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
  );
}
