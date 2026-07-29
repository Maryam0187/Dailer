"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadCsvSections } from "@/lib/exportCsv";
import { LEAD_PHASES, LEAD_PROGRESS_TAGS } from "@/lib/leadWorkflow";
import { buildWorkflowTagLookup, workflowTagDisplayLabel } from "@/lib/workflowTagLabels";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

const STATUS_COLUMNS = [
  ...LEAD_PHASES.map((p) => ({ key: p.value, category: "phase", fallback: p.label, tone: p.value })),
  ...LEAD_PROGRESS_TAGS.map((t) => ({ key: t.value, category: "progress", fallback: t.label, tone: null })),
];

const TEXT_SORT_KEYS = new Set([
  "username",
  "role",
  "agentUsername",
  "agentRole",
  "processorUsername",
]);

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
  if (role === "processor") return "Processor";
  return role || "—";
}

function formatCount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString();
}

function compareRows(a, b, key, dir) {
  const mult = dir === "asc" ? 1 : -1;
  if (TEXT_SORT_KEYS.has(key)) {
    const av = String(a[key] ?? "").toLowerCase();
    const bv = String(b[key] ?? "").toLowerCase();
    return mult * av.localeCompare(bv);
  }
  const av = Number(a[key]) || 0;
  const bv = Number(b[key]) || 0;
  if (av !== bv) return mult * (av - bv);
  const nameA = String(a.username ?? a.agentUsername ?? "").toLowerCase();
  const nameB = String(b.username ?? b.agentUsername ?? "").toLowerCase();
  return nameA.localeCompare(nameB);
}

function sortRows(rows, sortKey, sortDir) {
  return [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir));
}

/** Drop people/rows with no counted activity so tables stay short. */
function filterActiveRows(rows, metricKey = "total") {
  return rows.filter((row) => (Number(row[metricKey]) || 0) > 0);
}

function shiftLabel(shiftKey) {
  if (shiftKey === "day") return "day";
  if (shiftKey === "night") return "night";
  return "combined";
}

function useTableSort(defaultKey = "total", defaultDir = "desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);

  function onSort(columnKey) {
    if (sortKey === columnKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(columnKey);
    setSortDir(TEXT_SORT_KEYS.has(columnKey) ? "asc" : "desc");
  }

  return { sortKey, sortDir, onSort };
}

function SortableHeader({ label, columnKey, align = "left", sortKey, sortDir, onSort, title }) {
  const active = sortKey === columnKey;
  const thAlign = align === "right" ? "text-right" : "text-left";
  const btnJustify = align === "right" ? "justify-end" : "justify-start";

  return (
    <th
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950 ${thAlign}`}
      scope="col"
      title={title}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`inline-flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 ${btnJustify} ${
          active ? "text-emerald-700 dark:text-emerald-300" : ""
        }`}
      >
        <span>{label}</span>
        <span className="text-[10px] leading-none opacity-70" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function countClass(tone, value) {
  const n = Number(value) || 0;
  const base = "px-3 py-2.5 text-right tabular-nums font-medium";
  const muted = n === 0 ? "text-zinc-300 dark:text-zinc-600" : "";
  if (tone === "closed") {
    return `${base} ${n ? "text-emerald-700 dark:text-emerald-300" : muted}`;
  }
  if (tone === "cancelled") {
    return `${base} ${n ? "text-red-700 dark:text-red-300" : muted}`;
  }
  if (tone === "pending") {
    return `${base} ${n ? "text-amber-700 dark:text-amber-300" : muted}`;
  }
  if (tone === "processed") {
    return `${base} ${n ? "text-emerald-700 dark:text-emerald-300" : muted}`;
  }
  return `${base} ${n ? "text-zinc-900 dark:text-zinc-100" : muted}`;
}

function SummaryCards({ agentTotals, processorTotals, loading }) {
  const cards = [
    {
      label: "Leads created",
      value: agentTotals?.total,
      hint: "In selected range",
      tone: "default",
    },
    {
      label: "Active",
      value: agentTotals?.active,
      hint: "Current phase",
      tone: "default",
    },
    {
      label: "Sale close",
      value: agentTotals?.closed,
      hint: "Closed sales",
      tone: "good",
    },
    {
      label: "Cancelled",
      value: agentTotals?.cancelled,
      hint: "Cancelled leads",
      tone: "bad",
    },
    {
      label: "Processor assigned",
      value: processorTotals?.assigned,
      hint: "Sales with a processor",
      tone: "default",
    },
    {
      label: "Processed",
      value: processorTotals?.processed,
      hint: "Progress tag set",
      tone: "good",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const toneClass =
          card.tone === "good"
            ? "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
            : card.tone === "bad"
              ? "border-red-200/80 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/20"
              : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900";
        const valueClass =
          card.tone === "good"
            ? "text-emerald-800 dark:text-emerald-200"
            : card.tone === "bad"
              ? "text-red-800 dark:text-red-200"
              : "text-zinc-950 dark:text-zinc-50";
        return (
          <div key={card.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}>
              {loading ? "…" : formatCount(card.value)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">{card.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

function TableShell({ title, description, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3.5 dark:border-zinc-700 dark:bg-zinc-950/60">
        <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      <div className="max-h-[28rem] overflow-auto">{children}</div>
    </section>
  );
}

const totalsRowClass =
  "border-t-2 border-zinc-300 bg-zinc-100 font-semibold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50";

function EmptyOrLoading({ loading, emptyLabel, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-zinc-500">
        {loading ? "Loading…" : emptyLabel}
      </td>
    </tr>
  );
}

function ProcessorMetricsTable({ title, description, rows, totals, loading }) {
  const { sortKey, sortDir, onSort } = useTableSort("assigned", "desc");
  const sortedRows = useMemo(
    () => sortRows(filterActiveRows(rows, "assigned"), sortKey, sortDir),
    [rows, sortKey, sortDir],
  );
  const colSpan = 4;

  return (
    <TableShell title={title} description={description}>
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="text-xs">
          <tr>
            <SortableHeader
              label="Processor"
              columnKey="username"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Assigned"
              columnKey="assigned"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Processed"
              columnKey="processed"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Pending"
              columnKey="pending"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {loading || sortedRows.length === 0 ? (
            <EmptyOrLoading
              loading={loading}
              emptyLabel="No processor assignments with activity in this date range."
              colSpan={colSpan}
            />
          ) : (
            sortedRows.map((row, i) => (
              <tr
                key={row.userId ?? row.username}
                className={`transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 ${
                  i % 2 === 1 ? "bg-zinc-50/50 dark:bg-zinc-950/30" : ""
                }`}
              >
                <td className="sticky left-0 z-[1] bg-inherit px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {row.username}
                </td>
                <td className={countClass(null, row.assigned)}>{formatCount(row.assigned)}</td>
                <td className={countClass("processed", row.processed)}>{formatCount(row.processed)}</td>
                <td className={countClass("pending", row.pending)}>{formatCount(row.pending)}</td>
              </tr>
            ))
          )}
        </tbody>
        {totals && sortedRows.length > 0 ? (
          <tfoot>
            <tr className={totalsRowClass}>
              <td className="px-3 py-3">Total</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.assigned)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.processed)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.pending)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </TableShell>
  );
}

function AgentProcessorMetricsTable({ title, description, rows, totals, loading }) {
  const { sortKey, sortDir, onSort } = useTableSort("assigned", "desc");
  const sortedRows = useMemo(
    () => sortRows(filterActiveRows(rows, "assigned"), sortKey, sortDir),
    [rows, sortKey, sortDir],
  );
  const colSpan = 6;

  return (
    <TableShell title={title} description={description}>
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="text-xs">
          <tr>
            <SortableHeader
              label="Agent"
              columnKey="agentUsername"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Role"
              columnKey="agentRole"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Processor"
              columnKey="processorUsername"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Assigned"
              columnKey="assigned"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Processed"
              columnKey="processed"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Pending"
              columnKey="pending"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {loading || sortedRows.length === 0 ? (
            <EmptyOrLoading
              loading={loading}
              emptyLabel="No agent → processor assignments with activity in this date range."
              colSpan={colSpan}
            />
          ) : (
            sortedRows.map((row, i) => (
              <tr
                key={`${row.agentUserId}-${row.processorUserId}`}
                className={`transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 ${
                  i % 2 === 1 ? "bg-zinc-50/50 dark:bg-zinc-950/30" : ""
                }`}
              >
                <td className="sticky left-0 z-[1] bg-inherit px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {row.agentUsername}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-zinc-500 dark:text-zinc-400">
                  {formatRole(row.agentRole)}
                </td>
                <td className="px-3 py-2.5 text-zinc-800 dark:text-zinc-200">{row.processorUsername}</td>
                <td className={countClass(null, row.assigned)}>{formatCount(row.assigned)}</td>
                <td className={countClass("processed", row.processed)}>{formatCount(row.processed)}</td>
                <td className={countClass("pending", row.pending)}>{formatCount(row.pending)}</td>
              </tr>
            ))
          )}
        </tbody>
        {totals && sortedRows.length > 0 ? (
          <tfoot>
            <tr className={totalsRowClass}>
              <td className="px-3 py-3">Total</td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.assigned)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.processed)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.pending)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </TableShell>
  );
}

function MetricsTable({
  title,
  description,
  rows,
  totals,
  loading,
  columns,
  showRole = true,
  nameHeader = "Name",
  defaultSortKey = "total",
}) {
  const { sortKey, sortDir, onSort } = useTableSort(defaultSortKey, "desc");
  const sortedRows = useMemo(
    () => sortRows(filterActiveRows(rows, "total"), sortKey, sortDir),
    [rows, sortKey, sortDir],
  );
  const colSpan = (showRole ? 2 : 1) + 1 + columns.length;

  return (
    <TableShell title={title} description={description}>
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="text-xs">
          <tr>
            <SortableHeader
              label={nameHeader}
              columnKey="username"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            {showRole ? (
              <SortableHeader
                label="Role"
                columnKey="role"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
            ) : null}
            <SortableHeader
              label="Total"
              columnKey="total"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            {columns.map((col) => (
              <SortableHeader
                key={col.key}
                label={col.label}
                columnKey={col.key}
                align="right"
                title={col.fullLabel}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || sortedRows.length === 0 ? (
            <EmptyOrLoading
              loading={loading}
              emptyLabel="No leads with activity in this date range."
              colSpan={colSpan}
            />
          ) : (
            sortedRows.map((row, i) => (
              <tr
                key={row.userId ?? row.username}
                className={`transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 ${
                  i % 2 === 1 ? "bg-zinc-50/50 dark:bg-zinc-950/30" : ""
                }`}
              >
                <td className="sticky left-0 z-[1] whitespace-nowrap bg-inherit px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {row.username}
                </td>
                {showRole ? (
                  <td className="px-3 py-2.5 text-xs capitalize text-zinc-500 dark:text-zinc-400">
                    {formatRole(row.role)}
                  </td>
                ) : null}
                <td className={countClass(null, row.total)}>{formatCount(row.total)}</td>
                {columns.map((col) => (
                  <td key={col.key} className={countClass(col.tone, row[col.key])}>
                    {formatCount(row[col.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totals && sortedRows.length > 0 ? (
          <tfoot>
            <tr className={totalsRowClass}>
              <td className="px-3 py-3">Total</td>
              {showRole ? <td className="px-3 py-3" /> : null}
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(totals.total)}</td>
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-3 text-right tabular-nums">
                  {formatCount(totals[col.key])}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </TableShell>
  );
}

export default function LeadsStatsPanel({
  shiftKey: initialShiftKey = "all",
  workflowTags = [],
  preferShortLabels = true,
} = {}) {
  const [rangePreset, setRangePreset] = useState("today");
  const initialRange = getPresetRange("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [shiftFilter, setShiftFilter] = useState(
    initialShiftKey === "day" || initialShiftKey === "night" ? initialShiftKey : "all",
  );
  const [agentRows, setAgentRows] = useState([]);
  const [agentTotals, setAgentTotals] = useState(null);
  const [supervisorRows, setSupervisorRows] = useState([]);
  const [supervisorTotals, setSupervisorTotals] = useState(null);
  const [processorRows, setProcessorRows] = useState([]);
  const [processorTotals, setProcessorTotals] = useState(null);
  const [agentProcessorRows, setAgentProcessorRows] = useState([]);
  const [agentProcessorTotals, setAgentProcessorTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [loadedRange, setLoadedRange] = useState(null);

  const workflowTagLookup = useMemo(() => buildWorkflowTagLookup(workflowTags), [workflowTags]);

  const columns = useMemo(
    () =>
      STATUS_COLUMNS.map((col) => {
        const label = workflowTagDisplayLabel(workflowTagLookup, col.category, col.key, {
          preferShort: preferShortLabels,
          fallback: col.fallback,
        });
        const fullLabel = workflowTagDisplayLabel(workflowTagLookup, col.category, col.key, {
          preferShort: false,
          fallback: col.fallback,
        });
        return { ...col, label, fullLabel };
      }),
    [workflowTagLookup, preferShortLabels],
  );

  const activeAgentRows = useMemo(() => filterActiveRows(agentRows, "total"), [agentRows]);
  const activeSupervisorRows = useMemo(
    () => filterActiveRows(supervisorRows, "total"),
    [supervisorRows],
  );
  const activeProcessorRows = useMemo(
    () => filterActiveRows(processorRows, "assigned"),
    [processorRows],
  );
  const activeAgentProcessorRows = useMemo(
    () => filterActiveRows(agentProcessorRows, "assigned"),
    [agentProcessorRows],
  );

  const loadStats = useCallback(async (fromDate, toDate, shift) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ fromDate, toDate });
      if (shift === "day" || shift === "night") qs.set("shiftKey", shift);
      const res = await fetch(`/api/leads/metrics?${qs.toString()}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load lead stats");
      setAgentRows(json.agents || []);
      setAgentTotals(json.agentTotals || null);
      setSupervisorRows(json.supervisors || []);
      setSupervisorTotals(json.supervisorTotals || null);
      setProcessorRows(json.processors || []);
      setProcessorTotals(json.processorTotals || null);
      setAgentProcessorRows(json.agentProcessors || []);
      setAgentProcessorTotals(json.agentProcessorTotals || null);
      setLoadedRange({ from: fromDate, to: toDate, shift });
    } catch (e) {
      setError(e.message || "Failed to load lead stats");
      setAgentRows([]);
      setAgentTotals(null);
      setSupervisorRows([]);
      setSupervisorTotals(null);
      setProcessorRows([]);
      setProcessorTotals(null);
      setAgentProcessorRows([]);
      setAgentProcessorTotals(null);
      setLoadedRange(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const today = getPresetRange("today");
    void loadStats(today.from, today.to, shiftFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only; shift/date changes call loadStats directly
  }, [loadStats]);

  function applyPreset(preset) {
    setError(null);
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    void loadStats(next.from, next.to, shiftFilter);
  }

  function applyShift(nextShift) {
    setError(null);
    setShiftFilter(nextShift);
    void loadStats(rangeFrom, rangeTo, nextShift);
  }

  async function onApplyRange(e) {
    e.preventDefault();
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    await loadStats(rangeFrom, rangeTo, shiftFilter);
  }

  function onExportCsv(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!loadedRange || exporting) return;
    const hasRows =
      activeAgentRows.length ||
      activeSupervisorRows.length ||
      activeProcessorRows.length ||
      activeAgentProcessorRows.length;
    if (!hasRows) return;

    setExporting(true);
    try {
      const statusHeaders = columns.map((c) => c.fullLabel || c.label);
      const sections = [];

      if (activeAgentRows.length) {
        const headers = ["Name", "Role", "Total", ...statusHeaders];
        const rows = sortRows(activeAgentRows, "total", "desc").map((row) => [
          row.username,
          formatRole(row.role),
          row.total ?? 0,
          ...columns.map((c) => row[c.key] ?? 0),
        ]);
        if (agentTotals) {
          rows.push([
            "TOTAL",
            "",
            agentTotals.total ?? 0,
            ...columns.map((c) => agentTotals[c.key] ?? 0),
          ]);
        }
        sections.push({ title: "By agent", headers, rows });
      }

      if (activeSupervisorRows.length) {
        const headers = ["Supervisor", "Total", ...statusHeaders];
        const rows = sortRows(activeSupervisorRows, "total", "desc").map((row) => [
          row.username,
          row.total ?? 0,
          ...columns.map((c) => row[c.key] ?? 0),
        ]);
        if (supervisorTotals) {
          rows.push([
            "TOTAL",
            supervisorTotals.total ?? 0,
            ...columns.map((c) => supervisorTotals[c.key] ?? 0),
          ]);
        }
        sections.push({ title: "By supervisor (from agents)", headers, rows });
      }

      if (activeProcessorRows.length) {
        const headers = ["Processor", "Assigned", "Processed", "Pending"];
        const rows = sortRows(activeProcessorRows, "assigned", "desc").map((row) => [
          row.username,
          row.assigned ?? 0,
          row.processed ?? 0,
          row.pending ?? 0,
        ]);
        if (processorTotals) {
          rows.push([
            "TOTAL",
            processorTotals.assigned ?? 0,
            processorTotals.processed ?? 0,
            processorTotals.pending ?? 0,
          ]);
        }
        sections.push({ title: "By processor", headers, rows });
      }

      if (activeAgentProcessorRows.length) {
        const headers = ["Agent", "Role", "Processor", "Assigned", "Processed", "Pending"];
        const rows = sortRows(activeAgentProcessorRows, "assigned", "desc").map((row) => [
          row.agentUsername,
          formatRole(row.agentRole),
          row.processorUsername,
          row.assigned ?? 0,
          row.processed ?? 0,
          row.pending ?? 0,
        ]);
        if (agentProcessorTotals) {
          rows.push([
            "TOTAL",
            "",
            "",
            agentProcessorTotals.assigned ?? 0,
            agentProcessorTotals.processed ?? 0,
            agentProcessorTotals.pending ?? 0,
          ]);
        }
        sections.push({ title: "Agent to processor", headers, rows });
      }

      const rangePart = `${loadedRange.from}_to_${loadedRange.to}`;
      const shiftPart = shiftLabel(loadedRange.shift);
      downloadCsvSections(`lead-stats_${shiftPart}_${rangePart}.csv`, sections);
    } finally {
      setExporting(false);
    }
  }

  const rangeLabel =
    loadedRange?.from && loadedRange?.to
      ? `${loadedRange.from} — ${loadedRange.to}`
      : "Select dates and click Apply";
  const loadedShiftLabel =
    loadedRange?.shift === "day"
      ? "Day shift"
      : loadedRange?.shift === "night"
        ? "Night shift"
        : "Combined (all)";
  const canExport =
    Boolean(loadedRange) &&
    !loading &&
    !exporting &&
    (activeAgentRows.length > 0 ||
      activeSupervisorRows.length > 0 ||
      activeProcessorRows.length > 0 ||
      activeAgentProcessorRows.length > 0);

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-emerald-200/80 bg-white p-5 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900">
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

          <div>
            <label className={labelClass}>Shift</label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter stats by shift">
              {[
                { id: "all", label: "Combined (all)" },
                { id: "day", label: "Day shift" },
                { id: "night", label: "Night shift" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyShift(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    shiftFilter === p.id
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                  aria-pressed={shiftFilter === p.id}
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
                disabled={rangePreset !== "custom"}
                onChange={(e) => {
                  setRangePreset("custom");
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
                disabled={rangePreset !== "custom"}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeTo(e.target.value);
                }}
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={loading || rangePreset !== "custom"}
                className="h-11 flex-1 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Apply"}
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                disabled={!canExport}
                className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>
        </form>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Showing leads <span className="font-semibold text-zinc-800 dark:text-zinc-200">created</span> in the
          selected range. <span className="font-medium">{rangeLabel}</span>
          {loadedRange ? (
            <>
              {" "}
              · <span className="font-medium">{loadedShiftLabel}</span>
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Click any column header to sort. Rows with no activity are hidden. Sale status and progress counts
          use current workflow statuses. Processor stats count sales currently assigned to a processor.
        </p>
      </section>

      <SummaryCards agentTotals={agentTotals} processorTotals={processorTotals} loading={loading} />

      <MetricsTable
        title="By agent"
        description="Leads created by each agent, supervisor, and processor. Sorted by total by default — click headers to change."
        rows={agentRows}
        totals={agentTotals}
        loading={loading}
        columns={columns}
      />

      <MetricsTable
        title="By supervisor (from agents)"
        description="Leads assigned to each supervisor that were created by their agents. Does not include leads the supervisor created themselves."
        rows={supervisorRows}
        totals={supervisorTotals}
        loading={loading}
        columns={columns}
        showRole={false}
        nameHeader="Supervisor"
      />

      <ProcessorMetricsTable
        title="By processor"
        description="Sales currently assigned to each processor (from leads created in the selected date range)."
        rows={processorRows}
        totals={processorTotals}
        loading={loading}
      />

      <AgentProcessorMetricsTable
        title="Agent → processor"
        description="Which lead creator’s sales are assigned to which processor. Processed = progress tag set."
        rows={agentProcessorRows}
        totals={agentProcessorTotals}
        loading={loading}
      />
    </div>
  );
}
