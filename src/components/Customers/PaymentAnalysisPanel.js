"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import DateRangeFilter, { getPresetRange } from "@/components/DateRangeFilter";
import {
  formatLeadPaymentChargeAmount,
  getLeadPaymentChargeStatusMeta,
  LEAD_PAYMENT_PROCESSORS,
} from "@/lib/leadWorkflow";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50";

const btnSecondary =
  "inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

const inputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

function money(value) {
  if (value == null) return "—";
  return formatLeadPaymentChargeAmount(value) || "$0.00";
}

function dayEventCount(row) {
  return (row.chargedCount || 0) + (row.declinedCount || 0) + (row.chargebackCount || 0);
}

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function SummaryCard({ label, count, amount, tone }) {
  const tones = {
    emerald:
      "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100",
    red: "border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100",
    amber:
      "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone] || tones.emerald}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums opacity-90">{money(amount)}</p>
    </div>
  );
}

function processorOptionLabel(p) {
  const short = p.shortCode || p.label || p.code || p.value;
  const name = p.fullName || p.code || p.value;
  return short && name && short !== name ? `${short} · ${name}` : short || name || "Processor";
}

function statusToneClass(status) {
  if (status === "charged") return "text-emerald-700 dark:text-emerald-300";
  if (status === "declined") return "text-red-700 dark:text-red-300";
  if (status === "chargeback") return "text-amber-700 dark:text-amber-300";
  return "text-zinc-700 dark:text-zinc-300";
}

function DayDetailPanel({
  date,
  events,
  loading,
  error,
  onOpenRelatedSale,
  openingLeadId,
}) {
  if (loading) {
    return <p className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">Loading sales…</p>;
  }
  if (error) {
    return <p className="px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</p>;
  }
  if (!events.length) {
    return (
      <p className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        No payment events for {date}.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/40">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-2">Time</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Amount</th>
            <th className="px-4 py-2">Processor</th>
            <th className="px-4 py-2">Sale</th>
            <th className="px-4 py-2">Agent</th>
            <th className="px-4 py-2">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {events.map((ev) => {
            const sale = ev.sale;
            const statusLabel = getLeadPaymentChargeStatusMeta(ev.status).label;
            return (
              <tr key={ev.id}>
                <td className="whitespace-nowrap px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {formatWhen(ev.createdAt)}
                </td>
                <td className={`px-4 py-2 font-medium ${statusToneClass(ev.status)}`}>
                  {statusLabel}
                </td>
                <td className="px-4 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                  {money(ev.amount)}
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {ev.processorLabel || ev.processor || "—"}
                </td>
                <td className="px-4 py-2">
                  {sale ? (
                    <div className="min-w-[10rem]">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {sale.fullName || "Unnamed sale"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {sale.phone || "No phone"}
                        {sale.leadId != null ? ` · #${sale.leadId}` : ""}
                      </p>
                      {sale.leadId != null && onOpenRelatedSale ? (
                        <button
                          type="button"
                          disabled={openingLeadId === sale.leadId}
                          className="mt-1 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenRelatedSale({
                              customerId: sale.customerId,
                              leadId: sale.leadId,
                              processor: ev.processor,
                            });
                          }}
                        >
                          {openingLeadId === sale.leadId ? "Opening…" : "View sale"}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {sale?.agentUsername || "—"}
                </td>
                <td className="max-w-[14rem] px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {ev.declineReason || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PaymentAnalysisPanel({
  onOpenRelatedSale,
  openingLeadId = null,
  openSaleError = null,
}) {
  const initial = getPresetRange("week");
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [appliedFrom, setAppliedFrom] = useState(initial.from);
  const [appliedTo, setAppliedTo] = useState(initial.to);
  const [processor, setProcessor] = useState("all");
  const [appliedProcessor, setAppliedProcessor] = useState("all");
  const [processors, setProcessors] = useState(
    LEAD_PAYMENT_PROCESSORS.map((p) => ({
      code: p.value,
      shortCode: p.label,
      fullName: p.fullName,
      active: true,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState(null);
  const [byDay, setByDay] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [dayDetails, setDayDetails] = useState({});
  const [dayLoading, setDayLoading] = useState({});
  const [dayErrors, setDayErrors] = useState({});

  const loadProcessors = useCallback(async () => {
    try {
      const res = await fetch("/api/payment-processors", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const rows = Array.isArray(json.processors) ? json.processors : [];
      if (rows.length) setProcessors(rows);
    } catch {
      // Keep seed fallback list.
    }
  }, []);

  const loadStats = useCallback(async (fromDate, toDate, processorCode = "all") => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    setExpandedDate(null);
    setDayDetails({});
    setDayLoading({});
    setDayErrors({});
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      if (processorCode && processorCode !== "all") params.set("processor", processorCode);
      const res = await fetch(`/api/payment-processors/stats?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load payment stats");
      setTotals(json.totals || null);
      setByDay(Array.isArray(json.byDay) ? json.byDay : []);
      setAppliedFrom(json.fromDate || fromDate);
      setAppliedTo(json.toDate || toDate);
      setAppliedProcessor(json.processor || "all");
    } catch (e) {
      setError(e.message || "Failed to load payment stats");
      setTotals(null);
      setByDay([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDayDetails = useCallback(async (date, processorCode = "all") => {
    const cacheKey = `${date}|${processorCode || "all"}`;
    setDayLoading((prev) => ({ ...prev, [cacheKey]: true }));
    setDayErrors((prev) => ({ ...prev, [cacheKey]: null }));
    try {
      const params = new URLSearchParams({ date });
      if (processorCode && processorCode !== "all") params.set("processor", processorCode);
      const res = await fetch(`/api/payment-processors/stats/day?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load day details");
      setDayDetails((prev) => ({
        ...prev,
        [cacheKey]: Array.isArray(json.events) ? json.events : [],
      }));
    } catch (e) {
      setDayErrors((prev) => ({
        ...prev,
        [cacheKey]: e.message || "Failed to load day details",
      }));
    } finally {
      setDayLoading((prev) => ({ ...prev, [cacheKey]: false }));
    }
  }, []);

  useEffect(() => {
    void loadProcessors();
    void loadStats(initial.from, initial.to, "all");
  }, [loadProcessors, loadStats]);

  function onRangeChange(next) {
    setPreset(next.preset);
    setFrom(next.from);
    setTo(next.to);
    if (next.preset !== "custom" && next.from && next.to) {
      void loadStats(next.from, next.to, processor);
    }
  }

  function onProcessorChange(value) {
    setProcessor(value);
    // Always reload when a date range is set (including custom).
    if (from && to) {
      void loadStats(from, to, value);
    }
  }

  function onApplyCustom(e) {
    e.preventDefault();
    if (!from || !to) {
      setError("From date and to date are required");
      return;
    }
    if (from > to) {
      setError("From date must be on or before to date");
      return;
    }
    void loadStats(from, to, processor);
  }

  function onToggleDay(date, hasEvents) {
    if (!hasEvents) return;
    // Accordion: only one day open — opening another closes the previous.
    const willOpen = expandedDate !== date;
    setExpandedDate(willOpen ? date : null);
    if (!willOpen) return;
    const cacheKey = `${date}|${appliedProcessor || "all"}`;
    if (!dayDetails[cacheKey] && !dayLoading[cacheKey]) {
      void loadDayDetails(date, appliedProcessor);
    }
  }

  const appliedProcessorMeta = processors.find((p) => p.code === appliedProcessor);
  const appliedProcessorLabel = appliedProcessorMeta
    ? processorOptionLabel(appliedProcessorMeta)
    : appliedProcessor === "all"
      ? "All processors"
      : appliedProcessor;

  return (
    <div className="space-y-4">
      {error || openSaleError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error || openSaleError}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Payment analysis</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Totals and daily volume use each sale&apos;s latest outcome on the lead. Expand a day to
          see payment log events.
        </p>

        <form onSubmit={onApplyCustom} className="mt-4 flex flex-wrap items-end gap-3">
          <DateRangeFilter
            idPrefix="payment-analysis"
            preset={preset}
            from={from}
            to={to}
            onChange={onRangeChange}
          />
          <div className="w-full sm:min-w-[200px] sm:w-52">
            <label htmlFor="payment-analysis-processor" className={labelClass}>
              Processor
            </label>
            <select
              id="payment-analysis-processor"
              value={processor}
              onChange={(e) => onProcessorChange(e.target.value)}
              className={inputClass}
            >
              <option value="all">All processors</option>
              {processors.map((p) => (
                <option key={p.code || p.value} value={p.code || p.value}>
                  {processorOptionLabel(p)}
                </option>
              ))}
            </select>
          </div>
          {preset === "custom" ? (
            <button type="submit" className={btnPrimary} disabled={loading}>
              Apply
            </button>
          ) : null}
          <button
            type="button"
            className={btnSecondary}
            disabled={loading || !appliedFrom || !appliedTo}
            onClick={() => void loadStats(appliedFrom, appliedTo, processor)}
          >
            Refresh
          </button>
        </form>

        {appliedFrom && appliedTo ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Showing <span className="font-medium">{appliedFrom}</span> to{" "}
            <span className="font-medium">{appliedTo}</span>
            {" · "}
            <span className="font-medium">{appliedProcessorLabel}</span>
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Charged"
          count={totals?.chargedCount ?? 0}
          amount={totals?.chargedAmount ?? 0}
          tone="emerald"
        />
        <SummaryCard
          label="Declined"
          count={totals?.declinedCount ?? 0}
          amount={totals?.declinedAmount ?? 0}
          tone="red"
        />
        <SummaryCard
          label="Chargeback"
          count={totals?.chargebackCount ?? 0}
          amount={totals?.chargebackAmount ?? 0}
          tone="amber"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Volume per day</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Click a day to expand payment log details. View sale opens it in the side panel.
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
        ) : byDay.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-400">
            No payment charge events in this range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
                <tr>
                  <th className="w-10 px-4 py-3" aria-hidden />
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Charged</th>
                  <th className="px-4 py-3">Declined</th>
                  <th className="px-4 py-3">Chargeback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {byDay.map((row) => {
                  const hasEvents = dayEventCount(row) > 0;
                  const isExpanded = expandedDate === row.date;
                  const cacheKey = `${row.date}|${appliedProcessor || "all"}`;
                  return (
                    <Fragment key={row.date}>
                      <tr
                        className={
                          hasEvents
                            ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            : "opacity-70"
                        }
                        onClick={() => onToggleDay(row.date, hasEvents)}
                        aria-expanded={hasEvents ? isExpanded : undefined}
                      >
                        <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500">
                          {hasEvents ? (isExpanded ? "▾" : "▸") : ""}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {row.date}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.chargedCount} · {money(row.chargedAmount)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.declinedCount} · {money(row.declinedAmount)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.chargebackCount} · {money(row.chargebackAmount)}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${row.date}-detail`}>
                          <td colSpan={5} className="p-0">
                            <DayDetailPanel
                              date={row.date}
                              events={dayDetails[cacheKey] || []}
                              loading={Boolean(dayLoading[cacheKey])}
                              error={dayErrors[cacheKey] || null}
                              onOpenRelatedSale={onOpenRelatedSale}
                              openingLeadId={openingLeadId}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
