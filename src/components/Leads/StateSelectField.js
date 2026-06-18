"use client";

import { useEffect, useMemo, useState } from "react";
import { US_STATES, formatStateLocalTime, getStateByCode } from "@/lib/usStates";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const selectClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

/**
 * @param {{ value: string, onChange: (code: string) => void, disabled?: boolean, id?: string, showLocalTime?: boolean }} props
 */
export default function StateSelectField({
  value,
  onChange,
  disabled,
  id = "lead-state",
  showLocalTime = true,
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        State
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">Select state…</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name} ({s.code})
          </option>
        ))}
      </select>
      {showLocalTime ? <StateLocalTime stateCode={value} /> : null}
    </div>
  );
}

/** Live clock for a selected US state code (e.g. below a location row). */
export function StateLocalTime({ stateCode }) {
  const [now, setNow] = useState(() => new Date());
  const selected = useMemo(() => getStateByCode(stateCode), [stateCode]);

  useEffect(() => {
    if (!selected?.timeZone) return undefined;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [selected?.timeZone]);

  if (!selected) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Select a state to see local time.</p>
    );
  }

  const localTime = formatStateLocalTime(selected.timeZone, now);

  return (
    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300" aria-live="polite">
      Local time in {selected.name}: {localTime}
    </p>
  );
}
