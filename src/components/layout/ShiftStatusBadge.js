"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const styles = {
  active: {
    dot: "bg-emerald-500",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  ended: {
    dot: "bg-rose-500",
    pill: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  },
  disabled: {
    dot: "bg-zinc-400",
    pill: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300",
  },
};

export default function ShiftStatusBadge({ initialShiftStatus = null }) {
  const pathname = usePathname();
  const [shiftStatus, setShiftStatus] = useState(initialShiftStatus);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/shift/status", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setShiftStatus({
        status: json.status,
        label: json.label,
        detail: json.detail,
        windowLabel: json.windowLabel,
        active: json.active,
      });
    } catch {
      /* keep last known status */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, pathname]);

  useEffect(() => {
    function onShiftStatusChanged() {
      void loadStatus();
    }
    window.addEventListener("shift-status-changed", onShiftStatusChanged);
    return () => window.removeEventListener("shift-status-changed", onShiftStatusChanged);
  }, [loadStatus]);

  if (!shiftStatus) return null;

  const palette = styles[shiftStatus.status] ?? styles.disabled;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${palette.pill}`}
      title={shiftStatus.detail}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} aria-hidden />
      {shiftStatus.label}
    </span>
  );
}
