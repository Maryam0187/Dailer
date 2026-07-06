export const LEAD_PHASES = [
  { value: "active", label: "Active", tone: "emerald" },
  { value: "closed", label: "Sale close", tone: "zinc" },
  { value: "cancelled", label: "Cancelled", tone: "red" },
];

export const LEAD_PROGRESS_TAGS = [
  { value: "verified", label: "Verified", tone: "blue" },
  { value: "processed", label: "Processed", tone: "violet" },
  { value: "sale_done", label: "Sale done", tone: "emerald" },
];

export const LEAD_CONTACT_TAGS = [
  { value: "voicemail", label: "Voicemail", tone: "amber" },
  { value: "hangup", label: "Hangup", tone: "red" },
  { value: "no_response", label: "No response", tone: "zinc" },
  { value: "appointment", label: "Appointment", tone: "sky" },
];

export const LEAD_PAYMENT_METHODS = [
  { value: "check_mail", label: "Check mail", tone: "emerald" },
  { value: "card", label: "Card", tone: "blue" },
  { value: "pos_link", label: "POS Link", tone: "violet" },
];

export const LEAD_PHASE_VALUES = new Set(LEAD_PHASES.map((p) => p.value));
export const LEAD_PROGRESS_TAG_VALUES = new Set(LEAD_PROGRESS_TAGS.map((t) => t.value));
export const LEAD_CONTACT_TAG_VALUES = new Set(LEAD_CONTACT_TAGS.map((t) => t.value));
export const LEAD_PAYMENT_METHOD_VALUES = new Set(LEAD_PAYMENT_METHODS.map((m) => m.value));

const PHASE_MAP = Object.fromEntries(LEAD_PHASES.map((p) => [p.value, p]));
const PROGRESS_MAP = Object.fromEntries(LEAD_PROGRESS_TAGS.map((t) => [t.value, t]));
const CONTACT_MAP = Object.fromEntries(LEAD_CONTACT_TAGS.map((t) => [t.value, t]));
const PAYMENT_MAP = Object.fromEntries(LEAD_PAYMENT_METHODS.map((m) => [m.value, m]));

export const WORKFLOW_BADGE_CLASS = {
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  zinc: "border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
  red: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
  blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100",
  violet:
    "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100",
  amber:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100",
};

export function emptyContactCounts() {
  return { voicemail: 0, hangup: 0, no_response: 0, appointment: 0 };
}

export function normalizeContactCounts(raw) {
  const base = emptyContactCounts();
  if (!raw || typeof raw !== "object") return base;
  for (const key of LEAD_CONTACT_TAGS.map((t) => t.value)) {
    const n = Number(raw[key]);
    if (Number.isInteger(n) && n >= 0) base[key] = n;
  }
  return base;
}

export function getLeadPhaseMeta(phase) {
  return PHASE_MAP[String(phase || "").toLowerCase()] || { value: phase, label: phase || "—", tone: "zinc" };
}

export function getLeadProgressTagMeta(tag) {
  return PROGRESS_MAP[String(tag || "").toLowerCase()] || { value: tag, label: tag || "—", tone: "zinc" };
}

export function getLeadContactTagMeta(tag) {
  return CONTACT_MAP[String(tag || "").toLowerCase()] || { value: tag, label: tag || "—", tone: "zinc" };
}

export function getLeadPaymentMethodMeta(method) {
  return PAYMENT_MAP[String(method || "").toLowerCase()] || { value: method, label: method || "—", tone: "zinc" };
}

export function parseLeadProgressTags(raw) {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.map((v) => String(v).trim().toLowerCase()).filter((v) => LEAD_PROGRESS_TAG_VALUES.has(v)))];
}

export function normalizeLeadContactTag(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = String(raw).trim().toLowerCase();
  return LEAD_CONTACT_TAG_VALUES.has(value) ? value : undefined;
}

export function normalizeLeadPaymentMethod(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = String(raw).trim().toLowerCase();
  return LEAD_PAYMENT_METHOD_VALUES.has(value) ? value : undefined;
}

export function formatAppointmentActivity(at, note) {
  const when = new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const base = `Appointment — ${when}`;
  const trimmed = String(note || "").trim();
  return trimmed ? `${base} — ${trimmed}` : base;
}

export function contactOutcomeActivityLabel(tag, count, registry = null) {
  const label = registry
    ? registry?.contact?.[tag]?.fullLabel || tag
    : getLeadContactTagMeta(tag).label;
  if (tag === "appointment") return label;
  return count > 1 ? `${label} (${count})` : label;
}

export function formatLeadStatusShort(lead) {
  const phase = lead?.leadPhase || "active";
  if (phase === "closed") return "Sale close";
  if (phase === "cancelled") return "Cancelled";
  return "Active";
}

export function formatLeadWorkflowSummary(lead) {
  const parts = [];
  parts.push(getLeadPhaseMeta(lead?.leadPhase).label);

  const progress = (lead?.leadProgressTags || []).map((t) => getLeadProgressTagMeta(t).label);
  if (progress.length) parts.push(progress.join(", "));

  if (lead?.leadContactTag) {
    const counts = normalizeContactCounts(lead?.leadContactCounts);
    const count = counts[lead.leadContactTag] || 0;
    const label = getLeadContactTagMeta(lead.leadContactTag).label;
    parts.push(count > 1 ? `${label} ×${count}` : label);
  }

  if (lead?.leadPaymentMethod) {
    parts.push(getLeadPaymentMethodMeta(lead.leadPaymentMethod).label);
  }

  return parts.join(" · ");
}

export const LEAD_WORKFLOW_PATCH_KEYS = [
  "leadPhase",
  "leadProgressTags",
  "leadProcessedRequired",
  "leadContactTag",
  "leadAppointmentAt",
  "leadAppointmentNote",
  "leadPaymentMethod",
  "leadCancelReason",
];

export function hasLeadWorkflowPatch(body) {
  return LEAD_WORKFLOW_PATCH_KEYS.some((key) => body?.[key] !== undefined);
}
