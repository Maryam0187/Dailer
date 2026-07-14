export const LEAD_PHASES = [
  { value: "active", label: "Active", tone: "emerald" },
  { value: "closed", label: "Sale close", tone: "slate" },
  { value: "cancelled", label: "Cancelled", tone: "red" },
];

export const LEAD_PROGRESS_TAGS = [
  { value: "verified", label: "Verified", tone: "yellow" },
  { value: "processed", label: "Processed", tone: "violet" },
  { value: "sale_done", label: "Sale done", tone: "emerald" },
];

/** Progress list filters for leads missing a required tag (active sales only). */
export const LEAD_PROGRESS_MISSING_FILTERS = [
  { value: "missing_verified", tagKey: "verified", label: "Needs verification" },
  { value: "missing_sale_done", tagKey: "sale_done", label: "Needs sale done" },
  { value: "missing_processed", tagKey: "processed", label: "Needs processing", requiresProcessing: true },
];

export const LEAD_CONTACT_TAGS = [
  { value: "voicemail", label: "Voicemail", tone: "amber" },
  { value: "hangup", label: "Hangup", tone: "rose" },
  { value: "no_response", label: "No response", tone: "zinc" },
  { value: "appointment", label: "Appointment", tone: "sky" },
];

export const LEAD_PAYMENT_METHODS = [
  { value: "check_mail", label: "Check mail", tone: "teal" },
  { value: "e_check", label: "E-check", tone: "yellow" },
  { value: "card", label: "Card", tone: "indigo" },
  { value: "pos_link", label: "POS Link", tone: "fuchsia" },
];

/** Admin charge outcome for a linked customer payment method. */
export const LEAD_PAYMENT_CHARGE_STATUSES = [
  { value: "charged", label: "Charged", tone: "emerald" },
  { value: "declined", label: "Declined", tone: "red" },
  { value: "chargeback", label: "Chargeback", tone: "amber" },
];

/** Payment gateway used when charging a linked card. */
export const LEAD_PAYMENT_PROCESSORS = [
  { value: "auth", label: "PA", tone: "indigo" },
  { value: "kurv", label: "PC", tone: "teal" },
  { value: "cardpointe", label: "CP", tone: "sky" },
];

export const LEAD_PHASE_VALUES = new Set(LEAD_PHASES.map((p) => p.value));
export const LEAD_PROGRESS_TAG_VALUES = new Set(LEAD_PROGRESS_TAGS.map((t) => t.value));
export const LEAD_PROGRESS_MISSING_VALUES = new Set(LEAD_PROGRESS_MISSING_FILTERS.map((t) => t.value));
export const LEAD_PROGRESS_FILTER_VALUES = new Set([
  ...LEAD_PROGRESS_TAG_VALUES,
  ...LEAD_PROGRESS_MISSING_VALUES,
]);
export const LEAD_CONTACT_TAG_VALUES = new Set(LEAD_CONTACT_TAGS.map((t) => t.value));
export const LEAD_PAYMENT_METHOD_VALUES = new Set(LEAD_PAYMENT_METHODS.map((m) => m.value));
export const LEAD_PAYMENT_CHARGE_STATUS_VALUES = new Set(
  LEAD_PAYMENT_CHARGE_STATUSES.map((s) => s.value),
);
export const LEAD_PAYMENT_PROCESSOR_VALUES = new Set(LEAD_PAYMENT_PROCESSORS.map((p) => p.value));

const PHASE_MAP = Object.fromEntries(LEAD_PHASES.map((p) => [p.value, p]));
const PROGRESS_MAP = Object.fromEntries(LEAD_PROGRESS_TAGS.map((t) => [t.value, t]));
const CONTACT_MAP = Object.fromEntries(LEAD_CONTACT_TAGS.map((t) => [t.value, t]));
const PAYMENT_MAP = Object.fromEntries(LEAD_PAYMENT_METHODS.map((m) => [m.value, m]));
const CHARGE_STATUS_MAP = Object.fromEntries(LEAD_PAYMENT_CHARGE_STATUSES.map((s) => [s.value, s]));
const PROCESSOR_MAP = Object.fromEntries(LEAD_PAYMENT_PROCESSORS.map((p) => [p.value, p]));

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
  yellow:
    "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-100",
  sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100",
  lime: "border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-800 dark:bg-lime-950/50 dark:text-lime-100",
  rose: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100",
  slate:
    "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
  teal: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100",
  indigo:
    "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100",
  fuchsia:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-100",
};

export const WORKFLOW_SWATCH_CLASS = {
  emerald: "border-emerald-400 bg-emerald-500 dark:border-emerald-500 dark:bg-emerald-400",
  zinc: "border-zinc-400 bg-zinc-400 dark:border-zinc-500 dark:bg-zinc-300",
  red: "border-red-400 bg-red-500 dark:border-red-500 dark:bg-red-400",
  blue: "border-blue-400 bg-blue-500 dark:border-blue-500 dark:bg-blue-400",
  violet: "border-violet-400 bg-violet-500 dark:border-violet-500 dark:bg-violet-400",
  amber: "border-amber-400 bg-amber-500 dark:border-amber-500 dark:bg-amber-400",
  yellow: "border-yellow-400 bg-yellow-500 dark:border-yellow-500 dark:bg-yellow-400",
  sky: "border-sky-400 bg-sky-500 dark:border-sky-500 dark:bg-sky-400",
  lime: "border-lime-400 bg-lime-500 dark:border-lime-500 dark:bg-lime-400",
  rose: "border-rose-400 bg-rose-500 dark:border-rose-500 dark:bg-rose-400",
  slate: "border-slate-400 bg-slate-500 dark:border-slate-500 dark:bg-slate-400",
  teal: "border-teal-400 bg-teal-500 dark:border-teal-500 dark:bg-teal-400",
  indigo: "border-indigo-400 bg-indigo-500 dark:border-indigo-500 dark:bg-indigo-400",
  fuchsia: "border-fuchsia-400 bg-fuchsia-500 dark:border-fuchsia-500 dark:bg-fuchsia-400",
};

export const WORKFLOW_ICON_CLASS = {
  emerald: "text-emerald-500 dark:text-emerald-400",
  zinc: "text-zinc-500 dark:text-zinc-400",
  red: "text-red-500 dark:text-red-400",
  blue: "text-blue-500 dark:text-blue-400",
  violet: "text-violet-500 dark:text-violet-400",
  amber: "text-amber-500 dark:text-amber-400",
  yellow: "text-yellow-500 dark:text-yellow-400",
  sky: "text-sky-500 dark:text-sky-400",
  lime: "text-lime-500 dark:text-lime-400",
  rose: "text-rose-500 dark:text-rose-400",
  slate: "text-slate-500 dark:text-slate-400",
  teal: "text-teal-500 dark:text-teal-400",
  indigo: "text-indigo-500 dark:text-indigo-400",
  fuchsia: "text-fuchsia-500 dark:text-fuchsia-400",
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

export function getLeadPaymentChargeStatusMeta(status) {
  return (
    CHARGE_STATUS_MAP[String(status || "").toLowerCase()] || {
      value: status,
      label: status || "—",
      tone: "zinc",
    }
  );
}

export function normalizeLeadPaymentChargeStatus(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = String(raw).trim().toLowerCase();
  return LEAD_PAYMENT_CHARGE_STATUS_VALUES.has(value) ? value : undefined;
}

export function getLeadPaymentProcessorMeta(processor) {
  return (
    PROCESSOR_MAP[String(processor || "").toLowerCase()] || {
      value: processor,
      label: processor || "—",
      tone: "zinc",
    }
  );
}

export function normalizeLeadPaymentProcessor(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = String(raw).trim().toLowerCase();
  return LEAD_PAYMENT_PROCESSOR_VALUES.has(value) ? value : undefined;
}

/** Embed payment-method id so customer UI can group logs per card. */
export function withPaymentMethodId(body, pmId) {
  const text = String(body || "").trim();
  const id = Number(pmId);
  if (!text || !Number.isInteger(id) || id <= 0) return text;
  return `${text} [pmid:${id}]`;
}

export function parsePaymentMethodIdFromActivityBody(body) {
  const match = String(body || "").match(/\[pmid:(\d+)\]\s*$/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function stripPaymentMethodIdFromActivityBody(body) {
  return String(body || "")
    .replace(/\s*\[pmid:\d+\]\s*$/i, "")
    .trim();
}

export function formatPaymentChargeActivity(status, declineReason, pmId, processor) {
  const via = processor ? ` via ${getLeadPaymentProcessorMeta(processor).label}` : "";
  let text = `Payment charge status cleared${via}`;
  if (status === "charged") text = `Payment charged${via}`;
  else if (status === "chargeback") text = `Payment chargeback${via}`;
  else if (status === "declined") {
    const reason = String(declineReason || "").trim();
    text = reason ? `Payment declined${via}: ${reason}` : `Payment declined${via}`;
  }
  return withPaymentMethodId(text, pmId);
}

export function formatPaymentLinkActivity(linked, pmId) {
  return withPaymentMethodId(linked ? "Payment method linked" : "Payment method unlinked", pmId);
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

/** Format a datetime in a zone, including a short timezone name (e.g. PKT, EDT). */
export function formatZonedDateTime(at, timeZone) {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const options = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  if (timeZone) options.timeZone = timeZone;
  try {
    return d.toLocaleString("en-US", options);
  } catch {
    delete options.timeZone;
    return d.toLocaleString("en-US", options);
  }
}

/**
 * Appointment activity line: agent/local zone, plus customer zone when available.
 * @param {Date|string} at
 * @param {string|null|undefined} note
 * @param {string|undefined} agentTimeZone IANA zone (e.g. Asia/Karachi)
 * @param {string|undefined} customerTimeZone IANA zone from lead state
 */
export function formatAppointmentActivity(at, note, agentTimeZone, customerTimeZone) {
  const agentWhen = formatZonedDateTime(at, agentTimeZone);
  let when = agentWhen;
  if (customerTimeZone && customerTimeZone !== agentTimeZone) {
    const customerWhen = formatZonedDateTime(at, customerTimeZone);
    if (customerWhen && customerWhen !== agentWhen) {
      when = `${agentWhen} · customer ${customerWhen}`;
    }
  }
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
