"use client";

import { useCallback, useEffect, useState } from "react";

function formatMinutesRemaining(minutes) {
  if (minutes == null) return null;
  if (minutes <= 0) return "less than a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

export default function ShiftEndingSoonBanner() {
  const [info, setInfo] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/shift/status", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setInfo(json);
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const interval = window.setInterval(() => void loadStatus(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadStatus]);

  useEffect(() => {
    function onShiftStatusChanged() {
      void loadStatus();
    }
    window.addEventListener("shift-status-changed", onShiftStatusChanged);
    return () => window.removeEventListener("shift-status-changed", onShiftStatusChanged);
  }, [loadStatus]);

  if (!info?.endingSoon) return null;

  const minutesLabel = formatMinutesRemaining(info.minutesRemaining);
  const endLabel = info.shiftEndLabel
    ? `${info.shiftEndLabel}${info.timezoneLabel ? ` ${info.timezoneLabel}` : ""}`
    : null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-semibold">
        Shift ending soon{minutesLabel ? ` — ${minutesLabel} remaining` : ""}
        {endLabel ? ` (ends at ${endLabel})` : ""}
      </p>
      <p className="mt-0.5 text-amber-900/90 dark:text-amber-100/90">
        Please save your files and leads before shift ends.
      </p>
    </div>
  );
}
