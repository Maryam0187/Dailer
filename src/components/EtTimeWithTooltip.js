"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDualZoneWhenParts } from "@/lib/attendanceTime";

function ZoneRow({ region, dateLabel, timeLabel, accent }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {region}
        </p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
          {dateLabel}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold tabular-nums ${accent}`}>{timeLabel}</p>
      </div>
    </div>
  );
}

/**
 * Shows US Eastern time; hover reveals a polished ET + PKT panel.
 */
export default function EtTimeWithTooltip({ value, short = false, className = "" }) {
  const parts = getDualZoneWhenParts(value);
  const tipId = useId();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelWidth = 240;
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - panelWidth - 8,
    );
    const top = rect.bottom + 8;
    setCoords({ top, left });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updatePosition]);

  if (!parts) return "—";

  const iso = typeof value === "string" ? value : value?.toISOString?.() || undefined;
  const dateShown = short ? parts.etDateLabel.replace(/, \d{4}$/, "") : parts.etDateLabel;
  const pktDate = parts.sameDate ? parts.dateLabel : parts.pktDateLabel;
  const etDate = parts.sameDate ? parts.dateLabel : parts.etDateLabel;

  const panel =
    mounted && open
      ? createPortal(
          <div
            id={tipId}
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
            className="pointer-events-none fixed z-[200] w-[240px] rounded-xl border border-zinc-200/90 bg-white/95 p-3 shadow-lg shadow-zinc-900/10 ring-1 ring-black/5 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-black/40 dark:ring-white/5"
          >
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              Local times
            </p>
            <div className="space-y-2.5">
              <ZoneRow
                region="US Eastern"
                dateLabel={etDate}
                timeLabel={`${parts.etTime} ET`}
                accent="text-sky-700 dark:text-sky-300"
              />
              <div className="border-t border-zinc-100 dark:border-zinc-800" />
              <ZoneRow
                region="Pakistan"
                dateLabel={pktDate}
                timeLabel={`${parts.pktTime} PKT`}
                accent="text-emerald-700 dark:text-emerald-300"
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <time
        ref={triggerRef}
        dateTime={iso}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className={`group inline-flex max-w-full cursor-default items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-0.5 transition-colors hover:border-zinc-200 hover:bg-zinc-50 focus:outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-500/30 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80 dark:focus-visible:border-sky-600 ${className}`.trim()}
      >
        <span className="truncate text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
          {dateShown}
        </span>
        <span className="hidden h-3 w-px shrink-0 bg-zinc-200 sm:block dark:bg-zinc-700" aria-hidden />
        <span className="shrink-0 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
          {parts.etTime}
        </span>
        <span className="inline-flex shrink-0 items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-950/70 dark:text-sky-200">
          ET
        </span>
      </time>
      {panel}
    </>
  );
}
