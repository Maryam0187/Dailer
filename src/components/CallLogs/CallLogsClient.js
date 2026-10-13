"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { formatDuration } from "@/lib/formatDuration";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { usePlaceLine2Call } from "@/lib/usePlaceLine2Call";

const inputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const selectClass =
  "h-10 w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow,background-color] hover:border-zinc-300 hover:bg-zinc-50/80 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-900 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

function SelectChevron() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FilterSelect({ id, label, value, onChange, children, className = "w-[11.5rem]" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <select id={id} className={selectClass} value={value} onChange={onChange}>
          {children}
        </select>
        <SelectChevron />
      </div>
    </div>
  );
}

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
    const d = formatDateInput(today);
    return { from: d, to: d };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = formatDateInput(y);
    return { from: d, to: d };
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

function normalizeListScope(scope) {
  if (scope === "conference" || scope === "lead" || scope === "recording") {
    return scope;
  }
  return "all";
}

function isInProgressCallStatus(status) {
  return String(status || "").trim().toLowerCase() === "in-progress";
}

function formatCallWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function lineDotClass(dialerIndex) {
  return Number(dialerIndex) === 2 ? "bg-violet-500" : "bg-sky-500";
}

function statusDotClass(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed") return "bg-emerald-500";
  if (s === "in-progress" || s === "ringing" || s === "queued") return "bg-amber-500";
  if (s === "busy" || s === "no-answer" || s === "failed" || s === "canceled" || s === "cancelled") {
    return "bg-red-500";
  }
  return "bg-zinc-400";
}

function DownloadIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.69L6.3 8.49a.75.75 0 0 0-1.1 1.02l4.25 4.5a.75.75 0 0 0 1.1 0l4.25-4.5a.75.75 0 1 0-1.1-1.02l-2.95 3.12V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}

export default function CallLogsClient({ initialScope = "all", userRole = "agent" }) {
  const isAdmin = userRole === "admin";
  const { session, beginSession } = useActiveCall();
  const { placeLine2Call, canStartLine2, line2Session, canUseDialer2 } = usePlaceLine2Call();
  const {
    ensureRegistered,
    registered,
    sdkInitializing,
    voiceDisplaced,
    isPrimaryTab,
    expectOutgoingIncomingLeg,
  } = useTwilioVoice();
  // Only the primary tab in this browser may place calls. Secondary tabs are
  // hard-disabled here; the takeover affordance lives in the banner.
  const canStartCall =
    isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callingId, setCallingId] = useState(null);
  const [callingLine2Id, setCallingLine2Id] = useState(null);
  const [endingCallId, setEndingCallId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [rangePreset, setRangePreset] = useState("today");
  const initialRange = getPresetRange("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  /** `all` = every call; `conference` = calls with InviteDialLeg rows (owner + invited agent(s)). */
  const [listScope, setListScope] = useState(() => normalizeListScope(initialScope));
  /** Admin-only: `mine` = signed-in user; `all` = every user's call logs. */
  const [logAudience, setLogAudience] = useState("mine");
  /** `all` | `1` | `2` — Line 1 / Line 2 outbound. Default all so current list is unchanged. */
  const [lineFilter, setLineFilter] = useState("all");

  useEffect(() => {
    if (!canUseDialer2 && lineFilter === "2") {
      setLineFilter("all");
      setPage(1);
    }
  }, [canUseDialer2, lineFilter]);

  const loadCalls = useCallback(
    async ({
      signal,
      silent = false,
      targetPage,
      fromDate,
      toDate,
      scope: scopeOverride,
      audience: audienceOverride,
      line: lineOverride,
    } = {}) => {
    const resolvedPage = targetPage ?? page;
    const resolvedFromDate = fromDate ?? appliedFrom;
    const resolvedToDate = toDate ?? appliedTo;
    const resolvedScope = scopeOverride ?? listScope;
    const resolvedAudience = audienceOverride ?? logAudience;
    const resolvedLine = lineOverride ?? lineFilter;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(resolvedPage),
        pageSize: "20",
      });
      if (resolvedFromDate && resolvedToDate) {
        qs.set("fromDate", resolvedFromDate);
        qs.set("toDate", resolvedToDate);
      }
      if (resolvedScope === "conference" || resolvedScope === "lead") {
        qs.set("scope", resolvedScope);
      }
      if (resolvedScope === "recording") {
        qs.set("hasRecording", "true");
      }
      if (isAdmin && resolvedAudience === "all") {
        qs.set("view", "all");
      }
      if (resolvedLine === "1" || resolvedLine === "2") {
        qs.set("dialerIndex", resolvedLine);
      }
      const res = await fetch(`/api/calls?${qs.toString()}`, {
        method: "GET",
        credentials: "include",
        signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch call logs");
      setCalls(json.calls || []);
      if (json.pagination) {
        setPagination(json.pagination);
        setPage(json.pagination.page || resolvedPage);
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message || "Failed to fetch call logs");
      if (!silent) setCalls([]);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  },
    [page, appliedFrom, appliedTo, listScope, logAudience, lineFilter, isAdmin],
  );

  async function redial(call) {
    const useLine2 = Number(call.dialerIndex) === 2;
    if (useLine2) {
      if (line2Session) return;
      if (!canUseDialer2) {
        setError("Second dialer is not enabled for this account");
        return;
      }
      const id = call.id;
      const toNumber = call.toNumber;
      setError(null);
      setCallingLine2Id(id);
      try {
        await placeLine2Call({
          leadId: call.leadId || undefined,
          toNumber: call.leadId ? undefined : toNumber,
          phoneLabel: toNumber,
          customerName: call.leadName || call.contactName || undefined,
          callKind: call.callKind || (call.leadId ? "lead" : null),
          extra: {
            city: call.city || undefined,
            state: call.state || undefined,
            zipCode: call.zipCode || undefined,
          },
        });
        await loadCalls({ silent: true, targetPage: page, fromDate: appliedFrom, toDate: appliedTo });
      } catch (e) {
        setError(e.message || "Failed to place Line 2 call");
      } finally {
        setCallingLine2Id(null);
      }
      return;
    }

    if (session) return;
    const id = call.id;
    const toNumber = call.toNumber;
    setError(null);
    setCallingId(id);
    try {
      expectOutgoingIncomingLeg(45000);
      if (!registered || sdkInitializing) {
        await ensureRegistered();
      }

      const result = call.leadId
        ? await startOutgoingCall({ leadId: call.leadId })
        : await startOutgoingCall({ toNumber });

      if (!result.ok) throw new Error(result.error);

      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        callMode: result.callMode || "direct",
        callKind: call.callKind || (call.leadId ? "lead" : null),
        dialMode: "agent_first",
        toNumber: result.call.toNumber,
        phoneLabel: toNumber,
        customerName: call.leadName || call.contactName || undefined,
        city: call.city || undefined,
        state: call.state || undefined,
        zipCode: call.zipCode || undefined,
        leadId: call.leadId || undefined,
        conferenceName: result.conferenceName || undefined,
      });

      await loadCalls({ silent: true, targetPage: page, fromDate: appliedFrom, toDate: appliedTo });
    } catch (e) {
      setError(e.message || "Failed to place call");
    } finally {
      setCallingId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadCalls({ signal: controller.signal, targetPage: page, fromDate: appliedFrom, toDate: appliedTo });
    const onCallEnded = () => {
      loadCalls({ signal: controller.signal, silent: true, targetPage: page, fromDate: appliedFrom, toDate: appliedTo });
    };
    window.addEventListener("call-ended", onCallEnded);
    return () => {
      window.removeEventListener("call-ended", onCallEnded);
      controller.abort();
    };
  }, [loadCalls, page, appliedFrom, appliedTo]);

  function applyPreset(preset) {
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setPage(1);
  }

  async function onApplyRange() {
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    setError(null);
    setAppliedFrom(rangeFrom);
    setAppliedTo(rangeTo);
    setPage(1);
  }

  async function onPrevPage() {
    if (!pagination.hasPrev || loading || refreshing) return;
    const nextPage = Math.max(1, page - 1);
    setPage(nextPage);
    await loadCalls({ silent: true, targetPage: nextPage, fromDate: appliedFrom, toDate: appliedTo });
  }

  async function onNextPage() {
    if (!pagination.hasNext || loading || refreshing) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await loadCalls({ silent: true, targetPage: nextPage, fromDate: appliedFrom, toDate: appliedTo });
  }

  async function endInProgressCall(callId) {
    setError(null);
    setEndingCallId(callId);
    try {
      const res = await fetch("/api/calls/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ callId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to end call");
      await loadCalls({ silent: true, targetPage: page, fromDate: appliedFrom, toDate: appliedTo });
    } catch (e) {
      setError(e?.message || "Failed to end call");
    } finally {
      setEndingCallId(null);
    }
  }

  async function downloadRecording(callId, url) {
    if (!url) return;
    setError(null);
    setDownloadingId(callId);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to download recording");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `recording-call-${callId}.mp3`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e?.message || "Failed to download recording");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-sky-200/80 bg-white shadow-md shadow-sky-500/10 ring-1 ring-sky-500/10 dark:border-sky-900/45 dark:bg-zinc-900 dark:shadow-sky-950/15 dark:ring-sky-500/5">
      <div className="border-b-2 border-sky-200/70 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3.5 dark:border-sky-800/60 dark:from-sky-950/40 dark:to-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-sky-950 dark:text-sky-100">
              {listScope === "conference"
                ? "Conference call logs"
                : listScope === "recording"
                  ? "Calls with recording"
                  : "Call logs"}
            </h2>
            <p className="text-sm text-sky-800/80 dark:text-sky-300/90">
              {logAudience === "all"
                ? listScope === "conference"
                  ? "All users' conference calls. Filter by date below."
                  : listScope === "recording"
                    ? "All users' calls that have a downloadable recording. Filter by date below."
                    : "All users' outbound calls. Filter by date below."
                : listScope === "conference"
                  ? "Calls where another agent was invited (multi-agent conference). Filter by date below."
                  : listScope === "recording"
                    ? "Your calls that have a downloadable recording. Filter by date below."
                    : "Your recent outbound calls."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevPage}
              disabled={!pagination.hasPrev || refreshing || loading}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Prev
            </button>
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={onNextPage}
              disabled={!pagination.hasNext || refreshing || loading}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => loadCalls({ silent: true, targetPage: page, fromDate: appliedFrom, toDate: appliedTo })}
              disabled={refreshing || loading}
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-700 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="mb-3 flex flex-wrap items-end gap-2.5">
            {isAdmin ? (
              <FilterSelect
                id="calls-log-audience"
                label="Whose calls"
                value={logAudience}
                onChange={(e) => {
                  setLogAudience(e.target.value);
                  setPage(1);
                }}
                className="w-[10.5rem]"
              >
                <option value="mine">My calls</option>
                <option value="all">All users</option>
              </FilterSelect>
            ) : null}
            <FilterSelect
              id="calls-list-scope"
              label="List"
              value={listScope}
              onChange={(e) => {
                setListScope(e.target.value);
                setPage(1);
              }}
              className="w-[12.5rem]"
            >
              <option value="all">All calls</option>
              <option value="lead">Lead calls</option>
              <option value="recording">With recording</option>
              <option value="conference">Conference calls</option>
            </FilterSelect>
            {canUseDialer2 ? (
              <FilterSelect
                id="calls-line-filter"
                label="Dialer line"
                value={lineFilter}
                onChange={(e) => {
                  setLineFilter(e.target.value);
                  setPage(1);
                }}
                className="w-[9.5rem]"
              >
                <option value="all">All lines</option>
                <option value="1">Line 1</option>
                <option value="2">Line 2</option>
              </FilterSelect>
            ) : null}
          </div>
          <div className="mb-3">
            <label className={labelClass}>Range presets</label>
            <div className="flex flex-wrap items-end gap-2">
              {[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "week", label: "Week" },
                { id: "month", label: "Month" },
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
              <div>
                <label htmlFor="calls-from-date" className="sr-only">
                  From date
                </label>
                <input
                  id="calls-from-date"
                  type="date"
                  className={`${inputClass} w-[9.5rem]`}
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
                <label htmlFor="calls-to-date" className="sr-only">
                  To date
                </label>
                <input
                  id="calls-to-date"
                  type="date"
                  className={`${inputClass} w-[9.5rem]`}
                  value={rangeTo}
                  disabled={rangePreset !== "custom"}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeTo(e.target.value);
                  }}
                  required
                />
              </div>
              <button
                type="button"
                onClick={onApplyRange}
                disabled={loading || refreshing || rangePreset !== "custom"}
                className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                Apply range
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-base text-zinc-600 dark:text-zinc-300">Loading...</p>
        ) : error ? (
          <p className="text-base font-medium text-red-600">{error}</p>
        ) : calls.length === 0 ? (
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            {listScope === "recording"
              ? "No calls with a recording in this range."
              : listScope === "conference"
                ? logAudience === "all"
                  ? "No conference calls in this range."
                  : "No conference calls in this range (no agent invites on record)."
                : lineFilter === "2"
                  ? "No Line 2 calls in this range."
                  : lineFilter === "1"
                    ? "No Line 1 calls in this range."
                    : logAudience === "all"
                      ? "No calls in this range."
                      : "No calls yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-zinc-200 text-sm uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">When</th>
                  {canUseDialer2 ? (
                    <th className="py-2 pr-2" title="Line">
                      {isAdmin ? "L" : "Line"}
                    </th>
                  ) : null}
                  <th className="py-2 pr-3">Agent</th>
                  {listScope === "conference" ? (
                    <th className="py-2 pr-3">Invited</th>
                  ) : null}
                  {isAdmin ? <th className="py-2 pr-3">From</th> : null}
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-2" title="Status">
                    {isAdmin ? "St" : "Status"}
                  </th>
                  {isAdmin ? (
                    <>
                      <th className="py-2 pr-3">Agent leg</th>
                      <th className="py-2 pr-3">Customer leg</th>
                      <th className="py-2 pr-3">Total</th>
                    </>
                  ) : (
                    <th className="py-2 pr-3">Duration</th>
                  )}
                  <th className="py-2 pr-2" title="Recording">
                    {isAdmin ? "Rec" : "Recording"}
                  </th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {formatCallWhen(c.createdAt)}
                    </td>
                    {canUseDialer2 ? (
                      <td className="py-2 pr-2">
                        {isAdmin ? (
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${lineDotClass(c.dialerIndex)}`}
                            title={Number(c.dialerIndex) === 2 ? "Line 2" : "Line 1"}
                            aria-label={Number(c.dialerIndex) === 2 ? "Line 2" : "Line 1"}
                          />
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              Number(c.dialerIndex) === 2
                                ? "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
                                : "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                            }`}
                          >
                            {Number(c.dialerIndex) === 2 ? "Line 2" : "Line 1"}
                          </span>
                        )}
                      </td>
                    ) : null}
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {c.agentName || "—"}
                    </td>
                    {listScope === "conference" ? (
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {Array.isArray(c.invitedToNames) && c.invitedToNames.length > 0
                          ? c.invitedToNames.join(", ")
                          : "—"}
                      </td>
                    ) : null}
                    {isAdmin ? (
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {c.fromNumber || "—"}
                      </td>
                    ) : null}
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{c.toNumber}</td>
                    <td className="py-2 pr-2">
                      {isAdmin ? (
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(c.status)}`}
                          title={c.status || "—"}
                          aria-label={c.status || "unknown"}
                        />
                      ) : (
                        <span className="text-zinc-700 dark:text-zinc-200">{c.status}</span>
                      )}
                    </td>
                    {isAdmin ? (
                      <>
                        <td className="py-2 pr-3 tabular-nums text-zinc-700 dark:text-zinc-200">
                          {formatDuration(c.agentDurationSeconds)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-zinc-700 dark:text-zinc-200">
                          {formatDuration(c.customerDurationSeconds)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-zinc-700 dark:text-zinc-200">
                          {formatDuration(c.durationSeconds)}
                        </td>
                      </>
                    ) : (
                      <td className="py-2 pr-3 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatDuration(c.durationSeconds)}
                      </td>
                    )}
                    <td className="py-2 pr-2 text-zinc-700 dark:text-zinc-200">
                      {c.recordingDownloadUrl ? (
                        isAdmin ? (
                          <button
                            type="button"
                            onClick={() => downloadRecording(c.id, c.recordingDownloadUrl)}
                            disabled={downloadingId === c.id}
                            title={downloadingId === c.id ? "Downloading…" : "Download recording"}
                            aria-label={
                              downloadingId === c.id ? "Downloading recording" : "Download recording"
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
                          >
                            {downloadingId === c.id ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                            ) : (
                              <DownloadIcon />
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => downloadRecording(c.id, c.recordingDownloadUrl)}
                            disabled={downloadingId === c.id}
                            className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
                          >
                            {downloadingId === c.id ? "Downloading..." : "Download"}
                          </button>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end">
                        {isInProgressCallStatus(c.status) ? (
                          <button
                            type="button"
                            onClick={() => endInProgressCall(c.id)}
                            disabled={endingCallId === c.id || callingId === c.id || refreshing || loading}
                            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                          >
                            {endingCallId === c.id ? "Ending..." : "End"}
                          </button>
                        ) : null}
                        {(() => {
                          const isLine2 = Number(c.dialerIndex) === 2;
                          if (isLine2 && !canUseDialer2) return null;
                          const isCalling = isLine2 ? callingLine2Id === c.id : callingId === c.id;
                          const lineBusy = isLine2 ? Boolean(line2Session) : Boolean(session);
                          const voiceReady = isLine2 ? canStartLine2 : canStartCall;
                          const disabled =
                            isCalling || lineBusy || isPrimaryTab === false || !voiceReady;
                          let label = "Call";
                          if (isCalling) label = "Calling...";
                          else if (lineBusy) label = "Call in progress";
                          else if (isPrimaryTab === false) label = "Active in other tab";
                          else if (!isLine2 && voiceDisplaced) label = "Use this tab";
                          else if (!voiceReady) label = "Voice Not Ready";
                          return (
                            <button
                              type="button"
                              title={
                                isLine2
                                  ? "Redial on Line 2 (same line as this call)"
                                  : "Redial on Line 1 (same line as this call)"
                              }
                              onClick={() => redial(c)}
                              disabled={disabled}
                              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                                isLine2
                                  ? "border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/60"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Showing {calls.length} of {pagination.total} calls
          </p>
        ) : null}
      </div>
    </section>
  );
}
