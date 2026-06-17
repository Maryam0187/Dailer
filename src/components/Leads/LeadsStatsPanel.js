"use client";

import { useCallback, useEffect, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

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

function formatRole(role) {
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return role || "—";
}

function MetricsTable({ title, description, rows, totals, loading }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/60">
        <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{title}</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Closed</th>
              <th className="px-4 py-3 text-right">DNC</th>
              <th className="px-4 py-3 text-right">In progress</th>
              <th className="px-4 py-3 text-right">New</th>
              <th className="px-4 py-3 text-right">Contacted</th>
              <th className="px-4 py-3 text-right">Callback</th>
              <th className="px-4 py-3 text-right">Qualified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                  No leads in this date range.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId ?? row.username} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3 font-medium">{row.username}</td>
                  <td className="px-4 py-3 text-xs capitalize text-zinc-600 dark:text-zinc-400">
                    {formatRole(row.role)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                    {row.closed}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-300">{row.dnc}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.inProgress}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.new}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.contacted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.callback}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.qualified}</td>
                </tr>
              ))
            )}
            {totals && rows.length > 0 ? (
              <tr className="bg-zinc-50 font-semibold text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{totals.total}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.closed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.dnc}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.inProgress}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.new}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.contacted}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.callback}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.qualified}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LeadsStatsPanel() {
  const [rangePreset, setRangePreset] = useState("today");
  const initialRange = getPresetRange("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [agentRows, setAgentRows] = useState([]);
  const [agentTotals, setAgentTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedRange, setLoadedRange] = useState(null);

  const loadStats = useCallback(async (fromDate, toDate) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ fromDate, toDate });
      const res = await fetch(`/api/leads/metrics?${qs.toString()}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load lead stats");
      setAgentRows(json.agents || []);
      setAgentTotals(json.agentTotals || null);
      setLoadedRange({ from: fromDate, to: toDate });
    } catch (e) {
      setError(e.message || "Failed to load lead stats");
      setAgentRows([]);
      setAgentTotals(null);
      setLoadedRange(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const today = getPresetRange("today");
    void loadStats(today.from, today.to);
  }, [loadStats]);

  function clearStats() {
    setLoadedRange(null);
    setAgentRows([]);
    setAgentTotals(null);
  }

  function applyPreset(preset) {
    setRangePreset(preset);
    clearStats();
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
  }

  async function onApplyRange(e) {
    e.preventDefault();
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    await loadStats(rangeFrom, rangeTo);
  }

  const rangeLabel =
    loadedRange?.from && loadedRange?.to
      ? `${loadedRange.from} — ${loadedRange.to}`
      : "Select dates and click Apply";

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-emerald-200/80 bg-white p-6 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900">
        <form className="grid gap-4" onSubmit={onApplyRange}>
          <div>
            <label className={labelClass}>Date range</label>
            <div className="flex flex-wrap gap-2">
              {[
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
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="leads-stats-from" className={labelClass}>
                From date
              </label>
              <input
                id="leads-stats-from"
                type="date"
                className={inputClass}
                value={rangeFrom}
                onChange={(e) => {
                  setRangePreset("custom");
                  clearStats();
                  setRangeFrom(e.target.value);
                }}
                required
              />
            </div>
            <div>
              <label htmlFor="leads-stats-to" className={labelClass}>
                To date
              </label>
              <input
                id="leads-stats-to"
                type="date"
                className={inputClass}
                value={rangeTo}
                onChange={(e) => {
                  setRangePreset("custom");
                  clearStats();
                  setRangeTo(e.target.value);
                }}
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Apply"}
              </button>
            </div>
          </div>
        </form>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Showing leads <span className="font-semibold text-zinc-800 dark:text-zinc-200">created</span> in the
          selected range. <span className="font-medium">{rangeLabel}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Closed = done · DNC = cancelled
        </p>
      </section>

      <MetricsTable
        title="By agent"
        description="Leads created by each agent and supervisor in the selected date range."
        rows={agentRows}
        totals={agentTotals}
        loading={loading}
      />
    </div>
  );
}
