"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RECORDINGS_DOWNLOADED_KEY = "dialer-recordings-downloaded";

function loadDownloadedRecordingIds() {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(RECORDINGS_DOWNLOADED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : []);
  } catch {
    return new Set();
  }
}

function persistDownloadedRecordingIds(ids) {
  try {
    sessionStorage.setItem(RECORDINGS_DOWNLOADED_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";

const inputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

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
  return scope === "conference" ? "conference" : "all";
}

function isInProgressCallStatus(status) {
  return String(status || "").trim().toLowerCase() === "in-progress";
}

function isRecordingProcessing(call) {
  if (call.recordingDownloadUrl) return false;
  const status = String(call.recordingStatus || "").toLowerCase();
  return Boolean(status) && status !== "completed" && status !== "absent";
}

export default function CallLogsClient({ initialScope = "all", userRole = "agent" }) {
  const isAdmin = userRole === "admin";
  const isAgent = userRole === "agent";
  const { session, beginSession } = useActiveCall();
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
  const [endingCallId, setEndingCallId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadedRecordingIds, setDownloadedRecordingIds] = useState(() => loadDownloadedRecordingIds());
  const autoDownloadInFlightRef = useRef(false);
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
  /** `all` = every call; `conference` = calls with InviteDialLeg rows (owner + invited agent(s)). */
  const [listScope, setListScope] = useState(() => normalizeListScope(initialScope));

  const loadCalls = useCallback(
    async ({ signal, silent = false, targetPage, fromDate, toDate, scope: scopeOverride } = {}) => {
    const resolvedPage = targetPage ?? page;
    const resolvedFromDate = fromDate ?? rangeFrom;
    const resolvedToDate = toDate ?? rangeTo;
    const resolvedScope = scopeOverride ?? listScope;
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
      if (resolvedScope === "conference") {
        qs.set("scope", "conference");
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
    [page, rangeFrom, rangeTo, listScope],
  );

  async function redial(toNumber, id) {
    if (session) return;
    setError(null);
    setCallingId(id);
    try {
      expectOutgoingIncomingLeg(45000);
      if (!registered || sdkInitializing) {
        await ensureRegistered();
      }

      const result = await startOutgoingCall(toNumber);
      if (!result.ok) throw new Error(result.error);

      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        toNumber: result.call.toNumber,
        phoneLabel: toNumber,
        customerName: undefined,
        conferenceName: result.conferenceName || undefined,
      });

      await loadCalls({ silent: true, targetPage: page, fromDate: rangeFrom, toDate: rangeTo });
    } catch (e) {
      setError(e.message || "Failed to place call");
    } finally {
      setCallingId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadCalls({ signal: controller.signal, targetPage: page, fromDate: rangeFrom, toDate: rangeTo });
    const refreshOpts = { signal: controller.signal, silent: true, targetPage: page, fromDate: rangeFrom, toDate: rangeTo };
    const onCallEnded = () => {
      loadCalls(refreshOpts);
      // Twilio may need a few seconds to finalize recording media after hangup.
      window.setTimeout(() => loadCalls(refreshOpts), 4000);
      window.setTimeout(() => loadCalls(refreshOpts), 10000);
    };
    window.addEventListener("call-ended", onCallEnded);
    return () => {
      window.removeEventListener("call-ended", onCallEnded);
      controller.abort();
    };
  }, [loadCalls, page, rangeFrom, rangeTo]);

  function applyPreset(preset) {
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setPage(1);
  }

  async function onApplyRange() {
    setPage(1);
    await loadCalls({ targetPage: 1, fromDate: rangeFrom, toDate: rangeTo });
  }

  async function onPrevPage() {
    if (!pagination.hasPrev || loading || refreshing) return;
    const nextPage = Math.max(1, page - 1);
    setPage(nextPage);
    await loadCalls({ silent: true, targetPage: nextPage, fromDate: rangeFrom, toDate: rangeTo });
  }

  async function onNextPage() {
    if (!pagination.hasNext || loading || refreshing) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await loadCalls({ silent: true, targetPage: nextPage, fromDate: rangeFrom, toDate: rangeTo });
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
      await loadCalls({ silent: true, targetPage: page, fromDate: rangeFrom, toDate: rangeTo });
    } catch (e) {
      setError(e?.message || "Failed to end call");
    } finally {
      setEndingCallId(null);
    }
  }

  const markRecordingDownloaded = useCallback((callId) => {
    setDownloadedRecordingIds((prev) => {
      if (prev.has(callId)) return prev;
      const next = new Set(prev);
      next.add(callId);
      persistDownloadedRecordingIds(next);
      return next;
    });
  }, []);

  const downloadRecording = useCallback(
    async (callId, url, { silent = false } = {}) => {
      if (!url) return false;
      if (!silent) setError(null);
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
        markRecordingDownloaded(callId);
        return true;
      } catch (e) {
        if (!silent) setError(e?.message || "Failed to download recording");
        return false;
      } finally {
        setDownloadingId(null);
      }
    },
    [markRecordingDownloaded],
  );

  useEffect(() => {
    if (!isAgent || loading || calls.length === 0 || autoDownloadInFlightRef.current) return;

    const pending = calls.filter(
      (c) => c.recordingDownloadUrl && !downloadedRecordingIds.has(c.id),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    autoDownloadInFlightRef.current = true;

    (async () => {
      for (const call of pending) {
        if (cancelled) break;
        await downloadRecording(call.id, call.recordingDownloadUrl, { silent: true });
      }
    })().finally(() => {
      autoDownloadInFlightRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [isAgent, loading, calls, downloadedRecordingIds, downloadRecording]);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-sky-200/80 bg-white shadow-md shadow-sky-500/10 ring-1 ring-sky-500/10 dark:border-sky-900/45 dark:bg-zinc-900 dark:shadow-sky-950/15 dark:ring-sky-500/5">
      <div className="border-b-2 border-sky-200/70 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3.5 dark:border-sky-800/60 dark:from-sky-950/40 dark:to-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-sky-950 dark:text-sky-100">
              {listScope === "conference" ? "Conference call logs" : "Call logs"}
            </h2>
            <p className="text-sm text-sky-800/80 dark:text-sky-300/90">
              {listScope === "conference"
                ? "Calls where another agent was invited (multi-agent conference). Filter by date below."
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
              onClick={() => loadCalls({ silent: true, targetPage: page, fromDate: rangeFrom, toDate: rangeTo })}
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
          <div className="mb-3">
            <label className={labelClass}>List</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setListScope("all");
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  listScope === "all"
                    ? "border-sky-600 bg-sky-100 text-sky-950 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                All calls
              </button>
              <button
                type="button"
                onClick={() => {
                  setListScope("conference");
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  listScope === "conference"
                    ? "border-sky-600 bg-sky-100 text-sky-950 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Conference calls
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Conference list includes calls where another agent was invited via “Add agent”.
            </p>
          </div>
          <div className="mb-3">
            <label className={labelClass}>Range presets</label>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="calls-from-date" className={labelClass}>
                From date
              </label>
              <input
                id="calls-from-date"
                type="date"
                className={inputClass}
                value={rangeFrom}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeFrom(e.target.value);
                }}
                required
              />
            </div>
            <div>
              <label htmlFor="calls-to-date" className={labelClass}>
                To date
              </label>
              <input
                id="calls-to-date"
                type="date"
                className={inputClass}
                value={rangeTo}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeTo(e.target.value);
                }}
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={onApplyRange}
                disabled={loading || refreshing}
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
            {listScope === "conference"
              ? "No conference calls in this range (no agent invites on record)."
              : "No calls yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-zinc-200 text-sm uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Agent</th>
                  {listScope === "conference" ? (
                    <th className="py-2 pr-3">Invited</th>
                  ) : null}
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2 pr-3">Recording</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
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
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{c.toNumber}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">{c.status}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {c.durationSeconds ?? "—"}s
                    </td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {isAdmin && c.recordingDownloadUrl ? (
                        <button
                          type="button"
                          onClick={() => downloadRecording(c.id, c.recordingDownloadUrl)}
                          disabled={downloadingId === c.id}
                          className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
                        >
                          {downloadingId === c.id ? "Downloading..." : "Download"}
                        </button>
                      ) : isAdmin && isRecordingProcessing(c) ? (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Processing...
                        </span>
                      ) : isAgent && c.recordingDownloadUrl ? (
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {downloadingId === c.id
                            ? "Downloading..."
                            : downloadedRecordingIds.has(c.id)
                              ? "Saved"
                              : "Preparing..."}
                        </span>
                      ) : isAgent && isRecordingProcessing(c) ? (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Processing...
                        </span>
                      ) : c.recordingDownloadUrl || c.recordingStatus ? (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {c.recordingDurationSeconds != null
                            ? `${c.recordingDurationSeconds}s`
                            : c.recordingStatus || "Available"}
                        </span>
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
                        <button
                          type="button"
                          onClick={() => redial(c.toNumber, c.id)}
                          disabled={callingId === c.id || Boolean(session) || !canStartCall}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                        >
                          {session
                            ? "Call in progress"
                            : isPrimaryTab === false
                              ? "Active in other tab"
                              : voiceDisplaced
                                ? "Use this tab"
                                : !canStartCall
                                  ? "Voice Not Ready"
                                  : callingId === c.id
                                    ? "Calling..."
                                    : "Call"}
                        </button>
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
