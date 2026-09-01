"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 25;
const TABLE_COL_SPAN = 9;

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const yy = String(d.getFullYear()).slice(-2);
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${month} ${day}, ${yy} · ${time}`;
  } catch {
    return iso;
  }
}

function formatAmount(amount, currency) {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  // Chargeflow alert amounts are major currency units (e.g. 350 = $350.00), not cents.
  const code = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

function formatCard(networkTransaction) {
  if (!networkTransaction || typeof networkTransaction !== "object") return "—";
  const brand = networkTransaction.card_brand || "";
  const last4 = networkTransaction.last4 || "";
  if (brand && last4) return `${brand} ···· ${last4}`;
  if (last4) return `···· ${last4}`;
  if (brand) return brand;
  return "—";
}

function humanize(value) {
  if (!value) return "";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toneFor(kind, value) {
  const v = String(value || "").toLowerCase();
  if (kind === "type" || kind === "reason") {
    if (v.includes("fraud") || v.includes("warning")) {
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100";
    }
  }
  if (kind === "status" || kind === "outcome") {
    if (v.includes("pending") || v.includes("initiated") || v.includes("open")) {
      return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-100";
    }
    if (v.includes("refund") || v.includes("resolved") || v.includes("won") || v.includes("success")) {
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100";
    }
    if (v.includes("error") || v.includes("decline") || v.includes("lost") || v.includes("fail")) {
      return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100";
    }
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200";
}

function Badge({ kind, children }) {
  if (!children) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }
  return (
    <span
      className={`inline-flex max-w-[11rem] truncate rounded-md border px-2 py-0.5 text-xs font-semibold ${toneFor(kind, children)}`}
      title={humanize(children)}
    >
      {humanize(children)}
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150 dark:text-zinc-500 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  if (value == null || value === "") return null;

  async function onCopy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      aria-label={`Copy ${label}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function formatDetailValue(key, value, currencyHint) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "amount" || key.endsWith("_amount")) {
    return formatAmount(value, currencyHint);
  }
  if (
    key.endsWith("_at") ||
    key.endsWith("_date") ||
    key === "created_at" ||
    key === "status_date" ||
    key === "updated_at"
  ) {
    return formatWhen(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (
    key === "type" ||
    key === "reason" ||
    key === "status" ||
    key === "outcome" ||
    key === "card_brand"
  ) {
    return humanize(value);
  }
  return String(value);
}

function isMonoKey(key) {
  return /id|arn|auth|bin|transaction|descriptor|code/i.test(String(key));
}

function DetailField({ label, value, copyValue, mono = false }) {
  const hasCopy = copyValue != null && copyValue !== "";
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-3 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="flex items-start justify-between gap-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </dt>
        {hasCopy ? <CopyButton value={copyValue} label={label} /> : null}
      </div>
      <dd
        className={`mt-1.5 break-all text-sm font-medium text-zinc-900 dark:text-zinc-50 ${
          mono ? "whitespace-pre-wrap font-mono text-xs leading-relaxed" : ""
        }`}
      >
        {value == null || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
        {title}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </div>
  );
}

const ALERT_FIELD_ORDER = [
  "id",
  "type",
  "reason",
  "status",
  "status_date",
  "outcome",
  "amount",
  "currency",
  "statement_descriptor",
  "created_at",
  "transaction",
  "account_id",
  "ext_account_id",
];

const NETWORK_FIELD_ORDER = [
  "id",
  "created_at",
  "amount",
  "currency",
  "card_brand",
  "bin",
  "last4",
  "auth_code",
  "arn",
];

function orderedEntries(obj, preferredOrder) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const keys = Object.keys(obj);
  const preferred = preferredOrder.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !preferredOrder.includes(k)).sort();
  return [...preferred, ...rest].map((key) => [key, obj[key]]);
}

function AlertDetailPanel({ alert }) {
  const nt =
    alert?.network_transaction && typeof alert.network_transaction === "object"
      ? alert.network_transaction
      : null;

  const topEntries = orderedEntries(alert, ALERT_FIELD_ORDER).filter(
    ([key]) => key !== "network_transaction",
  );
  const networkEntries = nt ? orderedEntries(nt, NETWORK_FIELD_ORDER) : [];

  const extraTop = Object.entries(alert || {}).filter(
    ([key, value]) =>
      key !== "network_transaction" &&
      !ALERT_FIELD_ORDER.includes(key) &&
      value != null &&
      typeof value === "object",
  );

  return (
    <div className="space-y-5 rounded-xl border border-sky-200/80 bg-white/90 p-4 dark:border-sky-900/50 dark:bg-zinc-950/50">
      <DetailSection title="Alert">
        {topEntries.map(([key, raw]) => {
          const display = formatDetailValue(key, raw, alert.currency);
          const copyable =
            raw != null && typeof raw !== "object" ? String(raw) : null;
          return (
            <DetailField
              key={key}
              label={humanize(key)}
              value={display}
              copyValue={copyable}
              mono={isMonoKey(key) || typeof raw === "object"}
            />
          );
        })}
      </DetailSection>

      {networkEntries.length > 0 ? (
        <DetailSection title="Network transaction">
          {networkEntries.map(([key, raw]) => {
            const display = formatDetailValue(key, raw, nt.currency || alert.currency);
            const copyable =
              raw != null && typeof raw !== "object" ? String(raw) : null;
            return (
              <DetailField
                key={`nt-${key}`}
                label={humanize(key)}
                value={display}
                copyValue={copyable}
                mono={isMonoKey(key) || typeof raw === "object"}
              />
            );
          })}
        </DetailSection>
      ) : null}

      {extraTop.map(([key, raw]) => (
        <DetailSection key={key} title={humanize(key)}>
          {typeof raw === "object" && !Array.isArray(raw) ? (
            orderedEntries(raw, []).map(([childKey, childRaw]) => {
              const display = formatDetailValue(childKey, childRaw, alert.currency);
              const copyable =
                childRaw != null && typeof childRaw !== "object"
                  ? String(childRaw)
                  : null;
              return (
                <DetailField
                  key={`${key}-${childKey}`}
                  label={humanize(childKey)}
                  value={display}
                  copyValue={copyable}
                  mono={isMonoKey(childKey) || typeof childRaw === "object"}
                />
              );
            })
          ) : (
            <DetailField
              label={humanize(key)}
              value={formatDetailValue(key, raw, alert.currency)}
              copyValue={typeof raw !== "object" ? String(raw) : JSON.stringify(raw)}
              mono
            />
          )}
        </DetailSection>
      ))}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/80"
          style={{ opacity: 1 - i * 0.1 }}
        />
      ))}
    </div>
  );
}

const ALERT_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "fraud_warning", label: "Fraud warning" },
  { value: "ethoca", label: "Ethoca" },
  { value: "cdrn", label: "CDRN" },
  { value: "rdr", label: "RDR" },
  { value: "other", label: "Other" },
];

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") {
    return { from: formatDateInput(today), to: formatDateInput(today) };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: formatDateInput(y), to: formatDateInput(y) };
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

function getMonthRange(yearMonth) {
  // yearMonth: "YYYY-MM"
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return { from: "", to: "" };
  const [ys, ms] = yearMonth.split("-");
  const year = Number(ys);
  const monthIndex = Number(ms) - 1;
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

function buildMonthOptions(count = 18) {
  const options = [{ value: "", label: "Any month" }];
  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({
      value,
      label: `${months[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return options;
}

const MONTH_OPTIONS = buildMonthOptions(18);

function buildAlertsQuery({ offset, limit, type, from, to }) {
  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  if (type) params.set("type", type);
  // Send YYYY-MM-DD — our API filters by alert created_at locally
  // (Chargeflow's created_at_min/max currently return 400 for all ISO formats).
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

export default function ChargeflowAlertsClient() {
  const [alerts, setAlerts] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    offset: 0,
    limit: PAGE_SIZE,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [rangePreset, setRangePreset] = useState("all");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [applied, setApplied] = useState({
    from: "",
    to: "",
    type: "",
  });

  const load = useCallback(
    async (nextOffset = 0, filters = applied) => {
      const offset = Number.isInteger(nextOffset) && nextOffset >= 0 ? nextOffset : 0;
      setError(null);
      setLoading(true);
      try {
        const qs = buildAlertsQuery({
          offset,
          limit: PAGE_SIZE,
          type: filters.type,
          from: filters.from,
          to: filters.to,
        });
        const res = await fetch(`/api/chargeflow/alerts?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load alerts");
        setAlerts(Array.isArray(json.alerts) ? json.alerts : []);
        setExpandedId(null);
        const p = json.pagination || {};
        setPageIndex(offset);
        setPagination({
          totalCount: Number(p.totalCount) || 0,
          offset: Number.isFinite(Number(p.offset)) ? Number(p.offset) : offset,
          limit: Number(p.limit) || PAGE_SIZE,
          totalPages: Math.max(1, Number(p.totalPages) || 1),
        });
      } catch (err) {
        setError(err?.message || "Failed to load alerts");
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    },
    [applied],
  );

  useEffect(() => {
    void load(0, applied);
    // Initial load only; later loads go through Apply / pagination / refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex + 1 < pagination.totalPages;
  const showingFrom = pagination.totalCount === 0 ? 0 : pageIndex * pagination.limit + 1;
  const showingTo = Math.min((pageIndex + 1) * pagination.limit, pagination.totalCount);
  const filtersActive = Boolean(applied.from || applied.to || applied.type);
  const isCustom = rangePreset === "custom";

  function runFilters({ from, to, type }) {
    if (from && to && from > to) {
      setError("From date must be on or before To date");
      return;
    }
    const next = { from: from || "", to: to || "", type: type || "" };
    setApplied(next);
    void load(0, next);
  }

  function applyPreset(preset) {
    setRangePreset(preset);
    setMonthFilter("");
    if (preset === "custom") {
      return;
    }
    if (preset === "all") {
      setRangeFrom("");
      setRangeTo("");
      runFilters({ from: "", to: "", type: typeFilter });
      return;
    }
    const range = getPresetRange(preset);
    setRangeFrom(range.from);
    setRangeTo(range.to);
    runFilters({ from: range.from, to: range.to, type: typeFilter });
  }

  function onMonthChange(yearMonth) {
    setMonthFilter(yearMonth);
    if (!yearMonth) {
      setRangePreset("all");
      setRangeFrom("");
      setRangeTo("");
      runFilters({ from: "", to: "", type: typeFilter });
      return;
    }
    const range = getMonthRange(yearMonth);
    setRangePreset("month-select");
    setRangeFrom(range.from);
    setRangeTo(range.to);
    runFilters({ from: range.from, to: range.to, type: typeFilter });
  }

  function onTypeChange(nextType) {
    setTypeFilter(nextType);
    // Type applies immediately unless user is still editing a custom range.
    if (isCustom) return;
    const from = rangePreset === "all" ? "" : rangeFrom;
    const to = rangePreset === "all" ? "" : rangeTo;
    runFilters({ from, to, type: nextType });
  }

  function onApplyCustom(e) {
    e?.preventDefault?.();
    if (!rangeFrom || !rangeTo) {
      setError("Select both from and to dates for a custom range");
      return;
    }
    runFilters({ from: rangeFrom, to: rangeTo, type: typeFilter });
  }

  function onClearFilters() {
    setRangePreset("all");
    setRangeFrom("");
    setRangeTo("");
    setMonthFilter("");
    setTypeFilter("");
    runFilters({ from: "", to: "", type: "" });
  }

  function toggleRow(id) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900 sm:p-6">
        <form className="grid gap-4" onSubmit={onApplyCustom}>
          <div>
            <label className={labelClass}>Alert date range</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "all", label: "All time" },
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "week", label: "Last 7 days" },
                { id: "month", label: "This month" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    rangePreset === p.id
                      ? "border-sky-600 bg-sky-100 text-sky-950 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="cf-alert-month" className={labelClass}>
                Month
              </label>
              <select
                id="cf-alert-month"
                className={inputClass}
                value={monthFilter}
                onChange={(e) => onMonthChange(e.target.value)}
              >
                {MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value || "any"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cf-alert-type" className={labelClass}>
                Type
              </label>
              <select
                id="cf-alert-type"
                className={inputClass}
                value={typeFilter}
                onChange={(e) => onTypeChange(e.target.value)}
              >
                {ALERT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isCustom ? (
            <div className="grid gap-4 rounded-xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/50 dark:bg-sky-950/20 sm:grid-cols-3">
              <div>
                <label htmlFor="cf-alert-from" className={labelClass}>
                  From date
                </label>
                <input
                  id="cf-alert-from"
                  type="date"
                  className={inputClass}
                  value={rangeFrom}
                  required
                  onChange={(e) => {
                    setMonthFilter("");
                    setRangeFrom(e.target.value);
                  }}
                />
              </div>
              <div>
                <label htmlFor="cf-alert-to" className={labelClass}>
                  To date
                </label>
                <input
                  id="cf-alert-to"
                  type="date"
                  className={inputClass}
                  value={rangeTo}
                  required
                  onChange={(e) => {
                    setMonthFilter("");
                    setRangeTo(e.target.value);
                  }}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading || !rangeFrom || !rangeTo}
                  className="h-11 w-full rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
                >
                  Apply filters
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClearFilters}
              disabled={loading || !filtersActive}
              className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void load(pageIndex, applied)}
              disabled={loading}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M15.312 5.912a6.5 6.5 0 10.77 7.676.75.75 0 011.216.876 8 8 0 11-.91-9.37l.55-.55a.75.75 0 011.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 011.06-1.06l.614.618z"
                  clipRule="evenodd"
                />
              </svg>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Matching alerts"
          value={loading && alerts.length === 0 ? "…" : pagination.totalCount}
          hint={filtersActive ? "With current filters" : "All alerts"}
        />
        <StatCard
          label="This page"
          value={loading && alerts.length === 0 ? "…" : alerts.length}
          hint={`${pagination.limit} per page`}
        />
        <StatCard
          label="Page"
          value={loading && alerts.length === 0 ? "…" : `${pageIndex + 1} / ${pagination.totalPages}`}
          hint={pagination.totalCount > 0 ? `Showing ${showingFrom}–${showingTo}` : "No rows yet"}
        />
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Click a row to view the full CF alert payload.
        {filtersActive ? (
          <span className="ml-1 text-zinc-500">
            Filters:
            {applied.type ? ` type=${humanize(applied.type)}` : ""}
            {applied.from || applied.to
              ? ` dates ${applied.from || "…"} → ${applied.to || "…"}`
              : ""}
            .
          </span>
        ) : null}
      </p>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {loading && alerts.length === 0 ? <TableSkeleton /> : null}

        {!loading && !error && alerts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {filtersActive ? "No alerts match these filters" : "No alerts yet"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {filtersActive
                ? "Try a wider date range or clear the type filter."
                : "When CF alerts arrive from your connected processors, they will appear here."}
            </p>
          </div>
        ) : null}

        {alerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <th className="w-10 px-3 py-3.5" aria-label="Expand" />
                  <th className="px-3 py-3.5">Alert date</th>
                  <th className="px-3 py-3.5">Transaction date</th>
                  <th className="px-3 py-3.5">Type</th>
                  <th className="px-3 py-3.5">Reason</th>
                  <th className="px-3 py-3.5">Status</th>
                  <th className="px-3 py-3.5">Outcome</th>
                  <th className="px-3 py-3.5 text-right">Amount</th>
                  <th className="px-3 py-3.5">Card</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {alerts.map((alert) => {
                  const nt = alert.network_transaction || {};
                  const rowId = alert.id || String(alert.transaction || "");
                  const open = expandedId === rowId;
                  return (
                    <Fragment key={rowId}>
                      <tr
                        className={`cursor-pointer transition-colors ${
                          open
                            ? "bg-sky-50/70 dark:bg-sky-950/25"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                        }`}
                        onClick={() => toggleRow(rowId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRow(rowId);
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={open}
                      >
                        <td className="px-3 py-3.5">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                            <Chevron open={open} />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 font-medium text-zinc-800 dark:text-zinc-100">
                          {formatWhen(alert.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-zinc-700 dark:text-zinc-300">
                          {formatWhen(nt.created_at)}
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge kind="type">{alert.type}</Badge>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge kind="reason">{alert.reason}</Badge>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge kind="status">{alert.status}</Badge>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge kind="outcome">{alert.outcome}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right text-base font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {formatAmount(alert.amount, alert.currency)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-zinc-700 dark:text-zinc-300">
                          <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-800">
                            {formatCard(nt)}
                          </span>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-sky-50/40 dark:bg-sky-950/15">
                          <td colSpan={TABLE_COL_SPAN} className="px-4 py-4 sm:px-5">
                            <AlertDetailPanel alert={alert} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {alerts.length > 0 || (!loading && pagination.totalCount > 0) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {pagination.totalCount > 0
                ? `Showing ${showingFrom}–${showingTo} of ${pagination.totalCount}`
                : "No results"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load(pageIndex - 1, applied)}
                disabled={!hasPrev || loading}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void load(pageIndex + 1, applied)}
                disabled={!hasNext || loading}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

