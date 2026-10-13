/** Network-quality warning names from Twilio Voice JS SDK Call events. */
const SEVERE_WARNINGS = new Set([
  "low-mos",
  "high-packet-loss",
  "high-packets-lost-fraction",
  "network-quality-warning-low-mos",
  "network-quality-warning-high-packet-loss",
  "network-quality-warning-high-packets-lost-fraction",
]);

const MILD_WARNINGS = new Set([
  "high-rtt",
  "high-jitter",
  "network-quality-warning-high-rtt",
  "network-quality-warning-high-jitter",
]);

export const CALL_QUALITY_LEVELS = {
  good: "good",
  low: "low",
  poor: "poor",
};

/** Cycling samples for local / demo UI (no live Voice SDK). */
export const PREVIEW_CALL_QUALITY_SAMPLES = [
  { level: CALL_QUALITY_LEVELS.good, mos: 4.2 },
  { level: CALL_QUALITY_LEVELS.low, mos: 3.2 },
  { level: CALL_QUALITY_LEVELS.poor, mos: 2.4 },
];

/**
 * Normalize Twilio warning names (docs use both `low-mos` and prefixed forms).
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeQualityWarningName(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * @param {object} opts
 * @param {number | null | undefined} opts.mos Mean Opinion Score from Call `sample` (1–~4.5)
 * @param {Iterable<string>} [opts.activeWarnings] Active Call `warning` names
 * @returns {"good" | "low" | "poor" | null}
 */
export function deriveCallQualityLevel({ mos, activeWarnings = [] } = {}) {
  const warnings = [...activeWarnings].map(normalizeQualityWarningName).filter(Boolean);
  const hasSevere = warnings.some((w) => SEVERE_WARNINGS.has(w));
  const hasMild = warnings.some((w) => MILD_WARNINGS.has(w));
  const score = typeof mos === "number" && Number.isFinite(mos) ? mos : null;

  if (hasSevere || (score != null && score < 3.0)) return CALL_QUALITY_LEVELS.poor;
  if (hasMild || (score != null && score < 3.5)) return CALL_QUALITY_LEVELS.low;
  if (score == null) return null;
  return CALL_QUALITY_LEVELS.good;
}

/**
 * @param {"good" | "low" | "poor" | null | undefined} level
 */
export function callQualityLabel(level) {
  if (level === CALL_QUALITY_LEVELS.good) return "Good";
  if (level === CALL_QUALITY_LEVELS.low) return "Low";
  if (level === CALL_QUALITY_LEVELS.poor) return "Poor";
  return "Checking…";
}

/**
 * Tailwind classes for the in-call quality pill.
 * @param {"good" | "low" | "poor" | null | undefined} level
 * @param {"header" | "panel"} [variant="header"] header = on gradient bar; panel = on light status row
 */
export function callQualityPillClass(level, variant = "header") {
  if (variant === "panel") {
    if (level === CALL_QUALITY_LEVELS.good) {
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";
    }
    if (level === CALL_QUALITY_LEVELS.low) {
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200";
    }
    if (level === CALL_QUALITY_LEVELS.poor) {
      return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
    }
    return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
  if (level === CALL_QUALITY_LEVELS.good) return "bg-emerald-500/35 text-emerald-50";
  if (level === CALL_QUALITY_LEVELS.low) return "bg-amber-400/40 text-amber-50";
  if (level === CALL_QUALITY_LEVELS.poor) return "bg-red-500/40 text-red-50";
  return "bg-white/20 text-white/80";
}

/**
 * Dot color on the call header.
 * @param {"good" | "low" | "poor" | null | undefined} level
 * @param {boolean} inProgress
 */
export function callQualityDotClass(level, inProgress) {
  if (!inProgress) return "bg-gray-300";
  if (level === CALL_QUALITY_LEVELS.good) return "bg-emerald-400";
  if (level === CALL_QUALITY_LEVELS.low) return "bg-amber-300";
  if (level === CALL_QUALITY_LEVELS.poor) return "bg-red-400";
  return "bg-green-400";
}
