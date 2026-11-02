"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKFLOW_BADGE_CLASS } from "@/lib/leadWorkflow";
import { MANUAL_SHARE_VIEWER_STATUSES, shareViewerStatusMeta } from "@/lib/shareViewerStatus";
import { workflowTagDisplayLabel, workflowTagTone } from "@/lib/workflowTagLabels";

const SHARE_STATUS_COLOR = {
  emerald: { text: "#047857", background: "#d1fae5" },
  zinc: { text: "#3f3f46", background: "#f4f4f5" },
  red: { text: "#b91c1c", background: "#fee2e2" },
  blue: { text: "#1d4ed8", background: "#dbeafe" },
  violet: { text: "#6d28d9", background: "#ede9fe" },
  amber: { text: "#b45309", background: "#fef3c7" },
  yellow: { text: "#a16207", background: "#fef9c3" },
  sky: { text: "#0369a1", background: "#e0f2fe" },
  lime: { text: "#4d7c0f", background: "#ecfccb" },
  rose: { text: "#be123c", background: "#ffe4e6" },
  slate: { text: "#334155", background: "#e2e8f0" },
  teal: { text: "#0f766e", background: "#ccfbf1" },
  indigo: { text: "#4338ca", background: "#e0e7ff" },
  fuchsia: { text: "#a21caf", background: "#fae8ff" },
};

function shareStatusColor(tone) {
  return SHARE_STATUS_COLOR[tone] || SHARE_STATUS_COLOR.zinc;
}

export function shareStatusLabels(status, workflowTagLookup) {
  const meta = shareViewerStatusMeta(status);
  if (!meta) return null;
  const full = workflowTagDisplayLabel(workflowTagLookup, "share", status, {
    preferShort: false,
    fallback: meta.label,
  });
  const short = workflowTagDisplayLabel(workflowTagLookup, "share", status, {
    preferShort: true,
    fallback: meta.shortLabel || meta.label,
  });
  return { full, short, tone: workflowTagTone(workflowTagLookup, "share", status, meta.tone) };
}

export function ShareStatusBadge({ status, workflowTagLookup }) {
  const labels = shareStatusLabels(status, workflowTagLookup);
  if (!labels) return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  return (
    <span
      title={labels.full}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${WORKFLOW_BADGE_CLASS[labels.tone] || WORKFLOW_BADGE_CLASS.zinc}`}
    >
      {labels.short}
    </span>
  );
}

export function ShareStatusSelect({ lead, workflowTagLookup, onLeadUpdated }) {
  const [status, setStatus] = useState(lead?.sharedViewerStatus || "pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const locked = status === "lead_created" || Boolean(lead?.sharedCreatedLeadId);

  useEffect(() => {
    setStatus(lead?.sharedViewerStatus || "pending");
    setError(null);
  }, [lead?.id, lead?.sharedViewerStatus, lead?.sharedCreatedLeadId]);

  async function onStatusChange(next) {
    if (locked || busy || next === status) return;
    const previous = status;
    setStatus(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/share-status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedViewerStatus: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update share status");
      const saved = json.lead?.sharedViewerStatus || next;
      setStatus(saved);
      onLeadUpdated?.(json.lead || { ...lead, sharedViewerStatus: saved });
    } catch (e) {
      setStatus(previous);
      setError(e.message || "Failed to update share status");
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return <ShareStatusBadge status="lead_created" workflowTagLookup={workflowTagLookup} />;
  }

  const current = shareStatusLabels(status, workflowTagLookup);

  return (
    <select
      aria-label={`Share status for ${lead.fullName || "lead"}`}
      title={error || current?.full || "Share status"}
      value={status}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void onStatusChange(e.target.value)}
      style={{
        color: shareStatusColor(current?.tone).text,
        backgroundColor: shareStatusColor(current?.tone).background,
      }}
      className={`h-7 max-w-full rounded-lg border px-1.5 text-xs font-semibold disabled:opacity-60 ${
        error ? "border-red-400" : "border-transparent"
      }`}
    >
      {MANUAL_SHARE_VIEWER_STATUSES.map((option) => {
        const labels = shareStatusLabels(option.value, workflowTagLookup);
        const color = shareStatusColor(labels?.tone);
        return (
          <option
            key={option.value}
            value={option.value}
            style={{ color: color.text, backgroundColor: color.background, fontWeight: 600 }}
          >
            {labels?.short || option.shortLabel}
          </option>
        );
      })}
    </select>
  );
}

export default function ShareViewerStatusControls({
  lead,
  onLeadUpdated,
  workflowTagLookup,
  preferShortLabels = true,
}) {
  const [status, setStatus] = useState(lead?.sharedViewerStatus || "pending");
  const [createdLeadId, setCreatedLeadId] = useState(lead?.sharedCreatedLeadId || null);
  const [createdLeadName, setCreatedLeadName] = useState(lead?.sharedCreatedLeadName || "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setStatus(lead?.sharedViewerStatus || "pending");
    setCreatedLeadId(lead?.sharedCreatedLeadId || null);
    setCreatedLeadName(lead?.sharedCreatedLeadName || "");
    setConfirming(false);
    setError(null);
  }, [lead?.id, lead?.sharedViewerStatus, lead?.sharedCreatedLeadId, lead?.sharedCreatedLeadName]);

  const locked = status === "lead_created" || Boolean(createdLeadId);
  const createdLabels = shareStatusLabels("lead_created", workflowTagLookup);
  const createdLabel = preferShortLabels ? createdLabels?.short : createdLabels?.full;

  async function onStatusChange(next) {
    if (locked || busy || next === status) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/share-status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedViewerStatus: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update share status");
      if (json.lead) {
        setStatus(json.lead.sharedViewerStatus || next);
        onLeadUpdated?.(json.lead);
      } else {
        setStatus(next);
      }
    } catch (e) {
      setError(e.message || "Failed to update share status");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateLead() {
    if (locked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/create-from-share`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.createdLeadId) {
        setStatus("lead_created");
        setCreatedLeadId(json.createdLeadId);
        setConfirming(false);
        onLeadUpdated?.({
          ...lead,
          sharedViewerStatus: "lead_created",
          sharedCreatedLeadId: json.createdLeadId,
        });
        return;
      }
      if (!res.ok) throw new Error(json?.error || "Failed to create lead");
      setStatus("lead_created");
      setCreatedLeadId(json.createdLead?.id || json.lead?.sharedCreatedLeadId || null);
      setCreatedLeadName(json.createdLead?.fullName || json.lead?.sharedCreatedLeadName || "");
      setConfirming(false);
      if (json.lead) onLeadUpdated?.(json.lead);
    } catch (e) {
      setError(e.message || "Failed to create lead");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-white/80 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label
            htmlFor={`share-status-${lead.id}`}
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          >
            Share status
          </label>
          {locked ? (
            <ShareStatusBadge status="lead_created" workflowTagLookup={workflowTagLookup} />
          ) : (
            <select
              id={`share-status-${lead.id}`}
              value={status}
              disabled={busy}
              onChange={(e) => void onStatusChange(e.target.value)}
              style={{
                color: shareStatusColor(shareStatusLabels(status, workflowTagLookup)?.tone).text,
                backgroundColor: shareStatusColor(shareStatusLabels(status, workflowTagLookup)?.tone).background,
              }}
              className="h-9 w-full rounded-lg border border-transparent px-2.5 text-sm font-semibold"
            >
              {MANUAL_SHARE_VIEWER_STATUSES.map((option) => {
                const labels = shareStatusLabels(option.value, workflowTagLookup);
                const color = shareStatusColor(labels?.tone);
                const text = preferShortLabels
                  ? labels?.short
                  : labels && labels.short !== labels.full
                    ? `${labels.full} (${labels.short})`
                    : labels?.full;
                return (
                  <option
                    key={option.value}
                    value={option.value}
                    style={{ color: color.text, backgroundColor: color.background, fontWeight: 600 }}
                  >
                    {text}
                  </option>
                );
              })}
            </select>
          )}
        </div>
        {locked && createdLeadId ? (
          <Link
            href={`/leads/${createdLeadId}`}
            className="inline-flex h-9 items-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Open new lead{createdLeadName ? `: ${createdLeadName}` : ""}
          </Link>
        ) : confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCreateLead()}
              className="h-9 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Confirm create"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="h-9 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Create lead
          </button>
        )}
      </div>
      {confirming ? (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          This copies the customer into a new lead for the share user and marks this share as {createdLabel}.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
