"use client";

export default function ReportLoader({ label = "Loading…", compact = false }) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 ${
        compact ? "py-1" : "justify-center py-10"
      }`}
    >
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent dark:border-emerald-400"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

export function ReportLoadingOverlay({ label = "Loading…" }) {
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/75 backdrop-blur-[1px] dark:bg-zinc-950/70"
    >
      <ReportLoader label={label} compact />
    </div>
  );
}
