"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLeadPhoneDisplay } from "@/lib/maskPhone";
import { formatLeadService } from "@/lib/leadService";
import CopyPhoneButton from "@/components/Leads/CopyPhoneButton";
import IconTooltipButton, { CallIcon, CloseIcon, EditIcon } from "@/components/Leads/IconTooltipButton";
import RichTextField from "@/components/Leads/RichTextField";
import { RichHtmlContent } from "@/components/Leads/RichTextEditor";
import { isEmptyRichText } from "@/lib/richText";
import { formatDuration } from "@/lib/formatDuration";
import { WORKFLOW_BADGE_CLASS } from "@/lib/leadWorkflow";
import {
  formatActivityBodyWithTags,
  formatLeadWorkflowTooltipSummary,
  formatLeadStatusShortWithTags,
  workflowTagTone,
} from "@/lib/workflowTagLabels";
import LeadWorkflowSection from "@/components/Leads/LeadWorkflowSection";
import AssigneePicker from "@/components/Leads/AssigneePicker";

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

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function WorkflowHeaderBadge({ lead, workflowTagLookup, preferShortLabels }) {
  const phase = lead?.leadPhase || "active";
  const tone = workflowTagTone(workflowTagLookup, "phase", phase);
  const detail = formatLeadWorkflowTooltipSummary(lead, workflowTagLookup, preferShortLabels);
  return (
    <span
      title={detail}
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${WORKFLOW_BADGE_CLASS[tone]}`}
    >
      {formatLeadStatusShortWithTags(lead, workflowTagLookup, preferShortLabels)}
    </span>
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
  if (type === "breakdown_edit") {
    return (
      <div className={`${base} bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200`}>
        📋
      </div>
    );
  }
  if (type === "lead_phase_change") {
    return (
      <div className={`${base} bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200`}>
        ◆
      </div>
    );
  }
  if (type === "lead_edit") {
    return (
      <div className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200`}>
        ✎
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
    const from = update.previousStatus || "—";
    const to = update.newStatus || "—";
    return `Legacy status: ${from} → ${to}`;
  }
  if (update.type === "note_edit") return "Notes updated";
  if (update.type === "breakdown_edit") return "Breakdown updated";
  if (update.type === "lead_phase_change") return "Lead workflow updated";
  if (update.type === "lead_edit") return "Lead updated";
  if (update.type === "created") return "Lead created";
  return "Update";
}

function ActivityItem({ update, workflowTagLookup, preferShortLabels }) {
  const body =
    update.type === "lead_phase_change"
      ? formatActivityBodyWithTags(update.body, workflowTagLookup, preferShortLabels)
      : update.body;
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
        {body ? (
          update.type === "note_edit" || update.type === "breakdown_edit" ? (
            <div className="mt-2">
              <RichHtmlContent html={body} />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {body}
            </p>
          )
        ) : null}
      </div>
    </li>
  );
}

export default function LeadDetailPanel({
  lead,
  onClose,
  onLeadUpdated,
  onEdit,
  onCallLead,
  calling,
  canCall,
  hasActiveCall,
  phonesRedacted = false,
  workflowTagLookup = {},
  preferShortLabels = true,
  canAssignLead = false,
  canAssignToSelf = false,
  currentUserId = null,
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
  const [breakdownDraft, setBreakdownDraft] = useState(lead?.breakdown || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingBreakdown, setSavingBreakdown] = useState(false);
  const [activeTab, setActiveTab] = useState("activity");
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);

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
    setBreakdownDraft(lead?.breakdown || "");
    setError(null);
    setActiveTab("activity");
    void loadUpdates();
    void loadCalls();
  }, [lead?.id, lead?.notes, lead?.breakdown, lead?.updatedAt, loadUpdates, loadCalls]);

  useEffect(() => {
    const onCallEnded = () => {
      void loadCalls();
    };
    window.addEventListener("call-ended", onCallEnded);
    return () => window.removeEventListener("call-ended", onCallEnded);
  }, [loadCalls]);

  useEffect(() => {
    if (!canAssignLead) {
      setAssignableUsers([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingAssignableUsers(true);
    (async () => {
      try {
        const res = await fetch("/api/leads/assignable-users", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load users");
        if (!cancelled) setAssignableUsers(json.users || []);
      } catch (e) {
        if (!cancelled) {
          setAssignableUsers([]);
          setError(e.message || "Failed to load users");
        }
      } finally {
        if (!cancelled) setLoadingAssignableUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAssignLead]);

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

  async function onSaveBreakdown() {
    setSavingBreakdown(true);
    setError(null);
    try {
      await patchLead({ breakdown: breakdownDraft });
      await loadUpdates();
    } catch (e) {
      setError(e.message || "Failed to save breakdown");
    } finally {
      setSavingBreakdown(false);
    }
  }

  async function onAssigneeChange(userId) {
    setSavingAssignee(true);
    setError(null);
    try {
      await patchLead({ assignedUserId: Number(userId) });
      await loadUpdates();
    } catch (e) {
      setError(e.message || "Failed to assign lead");
    } finally {
      setSavingAssignee(false);
    }
  }

  const alreadyAssignedToSelf =
    currentUserId != null && Number(lead?.assignedUserId) === Number(currentUserId);
  const showAssignToMe =
    canAssignToSelf && currentUserId != null && !alreadyAssignedToSelf;

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
  const breakdownDirty = (breakdownDraft || "") !== (lead.breakdown || "");

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
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Service:</span>{" "}
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{formatLeadService(lead)}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Agent:</span>{" "}
                  {lead.createdByUsername || "—"}
                </p>
                <p className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Assigned to:</span>{" "}
                  <span>{savingAssignee ? "Saving…" : lead.assignedUsername || "—"}</span>
                  {canAssignLead ? (
                    <AssigneePicker
                      assignedUserId={lead.assignedUserId}
                      assignedUsername={lead.assignedUsername}
                      users={assignableUsers}
                      loading={loadingAssignableUsers}
                      saving={savingAssignee}
                      onSelect={onAssigneeChange}
                    />
                  ) : null}
                  {showAssignToMe ? (
                    <button
                      type="button"
                      disabled={savingAssignee}
                      onClick={() => void onAssigneeChange(currentUserId)}
                      className="ml-1 rounded-md border border-emerald-500/60 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 outline-none transition-colors hover:bg-emerald-100 focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-50 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                    >
                      Assign to me
                    </button>
                  ) : null}
                </p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Sale created:</span>{" "}
                  <time dateTime={lead.createdAt}>{formatDateTime(lead.createdAt)}</time>
                </p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Last updated:</span>{" "}
                  <time dateTime={lead.updatedAt}>{formatDateTime(lead.updatedAt)}</time>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-1.5">
              {onEdit ? (
                <IconTooltipButton title="Edit" variant="accent" onClick={onEdit}>
                  <EditIcon />
                </IconTooltipButton>
              ) : null}
              <IconTooltipButton title="Close" onClick={onClose}>
                <CloseIcon />
              </IconTooltipButton>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <WorkflowHeaderBadge lead={lead} workflowTagLookup={workflowTagLookup} preferShortLabels={preferShortLabels} />
            {!phonesRedacted && onCallLead ? (
              <IconTooltipButton
                title={calling ? "Calling…" : "Call lead"}
                variant="primary"
                disabled={
                  calling ||
                  !canCall ||
                  hasActiveCall ||
                  lead.status === "dnc" ||
                  lead.leadPhase === "cancelled"
                }
                onClick={async () => {
                  await onCallLead?.(lead);
                  await loadCalls();
                }}
              >
                <CallIcon />
              </IconTooltipButton>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <LeadWorkflowSection
            lead={lead}
            onPatch={patchLead}
            onReloadActivity={loadUpdates}
            setError={setError}
            workflowTagLookup={workflowTagLookup}
            preferShortLabels={preferShortLabels}
          />

          <section className="mb-6 rounded-2xl border border-violet-200/80 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
            <RichTextField
              label="Breakdown / Processing Notes"
              labelClass={labelClass}
              value={breakdownDraft}
              onChange={setBreakdownDraft}
              disabled={savingBreakdown}
              placeholder="Add breakdown details…"
              actions={
                breakdownDirty ? (
                  <button
                    type="button"
                    disabled={savingBreakdown}
                    onClick={() => void onSaveBreakdown()}
                    className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {savingBreakdown ? "Saving…" : "Save breakdown"}
                  </button>
                ) : null
              }
            />
            {isEmptyRichText(lead.breakdown) && isEmptyRichText(breakdownDraft) ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No breakdown yet.</p>
            ) : null}
          </section>

          <section className="mb-6 rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
            <RichTextField
              label="Lead notes"
              labelClass={labelClass}
              value={notesDraft}
              onChange={setNotesDraft}
              disabled={savingNotes}
              placeholder="Add context about this lead…"
              actions={
                notesDirty ? (
                  <button
                    type="button"
                    disabled={savingNotes}
                    onClick={() => void onSaveNotes()}
                    className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {savingNotes ? "Saving…" : "Save notes"}
                  </button>
                ) : null
              }
            />
            {isEmptyRichText(lead.notes) && isEmptyRichText(notesDraft) ? (
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
                  No activity yet. Update lead status or add a comment to start the timeline.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {updates.map((u) => (
                    <ActivityItem
                      key={u.id}
                      update={u}
                      workflowTagLookup={workflowTagLookup}
                      preferShortLabels={preferShortLabels}
                    />
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
