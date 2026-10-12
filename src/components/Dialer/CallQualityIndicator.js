"use client";

import {
  callQualityDotClass,
  callQualityLabel,
  callQualityPillClass,
} from "@/lib/callQuality";

/**
 * Live Voice SDK network quality (green / yellow / red) for an active call header.
 * @param {{ callQuality: { level?: string | null, mos?: number | null } | null, inProgress?: boolean }} props
 */
export default function CallQualityIndicator({ callQuality, inProgress = false }) {
  if (!inProgress) return null;

  const level = callQuality?.level ?? null;
  const label = callQualityLabel(level);
  const title =
    typeof callQuality?.mos === "number"
      ? `Call quality: ${label} (MOS ${callQuality.mos.toFixed(1)})`
      : `Call quality: ${label}`;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${callQualityPillClass(level)}`}
      title={title}
      aria-label={title}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${callQualityDotClass(level, true)}`} />
      {label}
    </div>
  );
}

export function CallQualityStatusDot({ callQuality, inProgress }) {
  return (
    <div
      className={`h-3 w-3 animate-pulse rounded-full ${callQualityDotClass(callQuality?.level ?? null, inProgress)}`}
      title={
        inProgress
          ? callQualityLabel(callQuality?.level ?? null)
          : undefined
      }
    />
  );
}
