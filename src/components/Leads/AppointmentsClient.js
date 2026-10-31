"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatZonedDateTime } from "@/lib/leadWorkflow";
import { getStateByCode } from "@/lib/usStates";

const PAGE_SIZE = 25;

function formatWhen(iso, agentTimeZone, stateCode) {
  if (!iso) return "—";
  const localWhen = formatZonedDateTime(iso, agentTimeZone);
  const customerTimeZone = getStateByCode(stateCode)?.timeZone;
  if (!customerTimeZone) return localWhen || "—";
  const customerWhen = formatZonedDateTime(iso, customerTimeZone);
  if (!customerWhen || customerWhen === localWhen) return localWhen || "—";
  return `${localWhen} · customer ${customerWhen}`;
}

function phaseLabel(phase) {
  if (phase === "closed") return "Sale close";
  if (phase === "cancelled") return "Cancelled";
  return "Active";
}

export default function AppointmentsClient() {
  const [scope, setScope] = useState("upcoming");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [timezone, setTimezone] = useState("");
  const [counts, setCounts] = useState({ upcoming: 0, all: 0 });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        scope,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/leads/appointments?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load appointments");
      setRows(Array.isArray(json.appointments) ? json.appointments : []);
      setTimezone(json.timezone || "");
      setCounts({
        upcoming: Number(json.counts?.upcoming) || 0,
        all: Number(json.counts?.all) || 0,
      });
      setPagination({
        page: json.pagination?.page || page,
        totalPages: json.pagination?.totalPages || 1,
        hasNext: Boolean(json.pagination?.hasNext),
        hasPrev: Boolean(json.pagination?.hasPrev),
        total: Number(json.pagination?.total) || 0,
      });
    } catch (err) {
      setRows([]);
      setError(err.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [scope, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectScope(next) {
    setScope(next);
    setPage(1);
  }

  const tabClass = (active) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active
        ? "border-sky-500 bg-sky-100 text-sky-950 dark:border-sky-500/70 dark:bg-sky-950/50 dark:text-sky-50"
        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tabClass(scope === "upcoming")} onClick={() => selectScope("upcoming")}>
          Upcoming ({counts.upcoming})
        </button>
        <button type="button" className={tabClass(scope === "all")} onClick={() => selectScope("all")}>
          All ({counts.all})
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Note</th>
                <th className="px-3 py-2.5">Assigned</th>
                <th className="px-3 py-2.5">Lead</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Loading appointments…
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                    {scope === "upcoming"
                      ? "No upcoming appointments."
                      : "No appointments saved on leads yet."}
                  </td>
                </tr>
              ) : null}
              {rows.map((lead) => {
                const at = lead.leadAppointmentAt ? new Date(lead.leadAppointmentAt) : null;
                const isUpcoming = at && !Number.isNaN(at.getTime()) && at.getTime() >= Date.now();
                return (
                  <tr key={lead.id} className="border-t border-zinc-100 dark:border-zinc-800/80">
                    <td className="px-3 py-3 align-top text-zinc-800 dark:text-zinc-100">
                      <div className="font-medium">{formatWhen(lead.leadAppointmentAt, timezone, lead.state)}</div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isUpcoming
                              ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                              : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                          }`}
                        >
                          {isUpcoming ? "Upcoming" : "Past"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-semibold text-zinc-950 hover:underline dark:text-zinc-50"
                      >
                        {lead.fullName?.trim() || "—"}
                      </Link>
                      {lead.company ? (
                        <div className="mt-0.5 text-xs text-zinc-500">{lead.company}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                      {lead.phone || "—"}
                    </td>
                    <td className="max-w-xs px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {lead.leadAppointmentNote?.trim() || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                      {lead.assignedUsername || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        {phaseLabel(lead.leadPhase)}
                      </div>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="mt-1 inline-block text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
                      >
                        Open lead
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          {pagination.total} {scope === "upcoming" ? "upcoming" : "total"}
          {pagination.totalPages > 1 ? ` · page ${pagination.page} of ${pagination.totalPages}` : ""}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!pagination.hasPrev || loading}
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!pagination.hasNext || loading}
            onClick={() => setPage((n) => n + 1)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
