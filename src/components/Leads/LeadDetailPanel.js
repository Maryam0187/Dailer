"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLeadPhoneDisplay } from "@/lib/maskPhone";
import { digitsOnly } from "@/lib/phoneFormat";
import { formatDuration } from "@/lib/formatDuration";
import { getLeadStatusMeta, LEAD_STATUSES, STATUS_BADGE_CLASS } from "@/lib/leadStatus";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

function formatLeadName(lead) {
  return lead?.fullName?.trim() || "—";
}

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  const meta = getLeadStatusMeta(status);
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE_CLASS[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}

function CopyPhoneButton({ phone, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const text = digitsOnly(phone) || phone || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={copied ? "Phone number copied" : "Copy phone number"}
      title={copied ? "Copied!" : "Copy phone number"}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
          <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
        </svg>
      )}
    </button>
  );
}

function ActivityIcon({ type }) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold";
  if (type === "comment") {
    return (
      <div className={`${base} bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200`}>
        💬
      </div>
    );
  }
  if (type === "status_change") {
    return (
      <div className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200`}>
        ↻
      </div>
    );
  }
  if (type === "note_edit") {
    return (
      <div className={`${base} bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200`}>
        📝
      </div>
    );
  }
  return (
    <div className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200`}>
      +
    </div>
  );
}

function activityTitle(update) {
  if (update.type === "comment") return "Comment";
  if (update.type === "status_change") {
    const from = getLeadStatusMeta(update.previousStatus).label;
    const to = getLeadStatusMeta(update.newStatus).label;
    return `Status: ${from} → ${to}`;
  }
  if (update.type === "note_edit") return "Notes updated";
  if (update.type === "created") return "Lead created";
  return "Update";
}

function ActivityItem({ update }) {
  return (
    <li className="flex gap-3">
      <ActivityIcon type={update.type} />
      <div className="min-w-0 flex-1 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3.5 py-3 dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{activityTitle(update)}</p>
          <time className="text-xs text-zinc-500 dark:text-zinc-400">{formatWhen(update.createdAt)}</time>
        </div>
        <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {update.username || "Unknown user"}
        </p>
        {update.body ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {update.body}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default function LeadDetailPanel({
  lead,
  onClose,
  onLeadUpdated,
  onCallLead,
  calling,
  canCall,
  hasActiveCall,
  phonesRedacted = false,
}) {
  const [updates, setUpdates] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState(null);
  const [comment, setComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lead?.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("activity");

  const loadUpdates = useCallback(async () => {
    if (!lead?.id) return;
    setLoadingUpdates(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/updates`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load activity");
      setUpdates(json.updates || []);
    } catch (e) {
      setError(e.message || "Failed to load activity");
      setUpdates([]);
    } finally {
      setLoadingUpdates(false);
    }
  }, [lead?.id]);

  const loadCalls = useCallback(async () => {
    if (!lead?.id) return;
    setLoadingCalls(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/calls`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load call logs");
      setCalls(json.calls || []);
    } catch (e) {
      setError(e.message || "Failed to load call logs");
      setCalls([]);
    } finally {
      setLoadingCalls(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    setNotesDraft(lead?.notes || "");
    setError(null);
    setActiveTab("activity");
    void loadUpdates();
    void loadCalls();
  }, [lead?.id, lead?.notes, loadUpdates, loadCalls]);

  useEffect(() => {
    const onCallEnded = () => {
      void loadCalls();
    };
    window.addEventListener("call-ended", onCallEnded);
    return () => window.removeEventListener("call-ended", onCallEnded);
  }, [loadCalls]);

  async function patchLead(payload) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Update failed");
    onLeadUpdated?.(json.lead);
    return json.lead;
  }

  async function onPostComment(e) {
    e.preventDefault();
    const text = comment.trim();
    if (!text) return;
    setPostingComment(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comment: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to post comment");
      setComment("");
      setActiveTab("activity");
      await loadUpdates();
    } catch (e) {
      setError(e.message || "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  }

  async function onSaveNotes() {
    setSavingNotes(true);
    setError(null);
    try {
      await patchLead({ notes: notesDraft });
      await loadUpdates();
    } catch (e) {
      setError(e.message || "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  async function onStatusChange(nextStatus) {
    if (nextStatus === lead.status || statusBusy) return;
    setStatusBusy(true);
    setError(null);
    try {
      await patchLead({ status: nextStatus });
      await loadUpdates();
    } catch (e) {
      setError(e.message || "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  async function downloadRecording(callId, url) {
    if (!url) return;
    setDownloadingId(callId);
    setError(null);
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
      setError(e.message || "Failed to download recording");
    } finally {
      setDownloadingId(null);
    }
  }

  if (!lead) return null;

  const notesDirty = (notesDraft || "") !== (lead.notes || "");

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-label="Close lead details"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 bg-gradient-to-r from-emerald-50/80 to-white px-5 py-4 dark:border-zinc-800 dark:from-emerald-950/30 dark:to-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Lead details
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                {formatLeadName(lead)}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-zinc-600 dark:text-zinc-400">
                {!phonesRedacted ? <CopyPhoneButton phone={lead.phone} /> : null}
                <span>{formatLeadPhoneDisplay(lead.phone, phonesRedacted)}</span>
              </p>
              {lead.cellNumber ? (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-zinc-600 dark:text-zinc-400">
                  {!phonesRedacted ? <CopyPhoneButton phone={lead.cellNumber} /> : null}
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cell</span>
                  <span>{formatLeadPhoneDisplay(lead.cellNumber, phonesRedacted)}</span>
                </p>
              ) : null}
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {[lead.state, lead.city, lead.zipCode].filter(Boolean).join(", ") || "No location"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Agent:</span>{" "}
                  {lead.createdByUsername || "—"}
                </p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Supervisor:</span>{" "}
                  {lead.assignedUsername || "—"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Close
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            {!phonesRedacted && onCallLead ? (
              <button
                type="button"
                disabled={calling || !canCall || hasActiveCall || lead.status === "dnc"}
                onClick={async () => {
                  await onCallLead?.(lead);
                  await loadCalls();
                }}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {calling ? "Calling…" : "Call lead"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="mb-6">
            <label className={labelClass}>Status</label>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((s) => {
                const active = lead.status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={statusBusy}
                    onClick={() => void onStatusChange(s.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      active
                        ? STATUS_BADGE_CLASS[s.tone]
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className={labelClass}>Lead notes</label>
              {notesDirty ? (
                <button
                  type="button"
                  disabled={savingNotes}
                  onClick={() => void onSaveNotes()}
                  className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {savingNotes ? "Saving…" : "Save notes"}
                </button>
              ) : null}
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Add context about this lead…"
              className={`${inputClass} min-h-[96px] resize-y`}
            />
            {!lead.notes && !notesDraft ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No notes yet.</p>
            ) : null}
          </section>

          <form
            onSubmit={onPostComment}
            className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            <label className={labelClass}>Add comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add a comment for your team…"
              className={`${inputClass} min-h-[72px] resize-y`}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={postingComment || !comment.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {postingComment ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form>

          <section>
            <div className="mb-4 flex gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
              <button
                type="button"
                onClick={() => setActiveTab("activity")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "activity"
                    ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-800 dark:text-emerald-200"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Activity
                {updates.length > 0 ? (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                    {updates.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("calls")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "calls"
                    ? "bg-white text-sky-800 shadow-sm dark:bg-zinc-800 dark:text-sky-200"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Call logs
                {calls.length > 0 ? (
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                    {calls.length}
                  </span>
                ) : null}
              </button>
            </div>

            {error ? (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </p>
            ) : null}

            {activeTab === "calls" ? (
              loadingCalls ? (
                <p className="text-sm text-zinc-500">Loading calls…</p>
              ) : calls.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600">
                  No calls logged for this lead yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                      <tr>
                        <th className="px-3 py-2">When</th>
                        <th className="px-3 py-2">Agent</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Duration</th>
                        <th className="px-3 py-2 text-right">Recording</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {calls.map((call) => (
                        <tr key={call.id} className="text-zinc-700 dark:text-zinc-300">
                          <td className="px-3 py-2.5 whitespace-nowrap">{formatWhen(call.createdAt)}</td>
                          <td className="px-3 py-2.5">{call.agentName}</td>
                          <td className="px-3 py-2.5 capitalize">{call.status}</td>
                          <td className="px-3 py-2.5 tabular-nums">{formatDuration(call.durationSeconds)}</td>
                          <td className="px-3 py-2.5 text-right">
                            {call.recordingDownloadUrl ? (
                              <button
                                type="button"
                                onClick={() => void downloadRecording(call.id, call.recordingDownloadUrl)}
                                disabled={downloadingId === call.id}
                                className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200"
                              >
                                {downloadingId === call.id ? "…" : "Download"}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              loadingUpdates ? (
                <p className="text-sm text-zinc-500">Loading activity…</p>
              ) : updates.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600">
                  No activity yet. Change status or add a comment to start the timeline.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {updates.map((u) => (
                    <ActivityItem key={u.id} update={u} />
                  ))}
                </ul>
              )
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
