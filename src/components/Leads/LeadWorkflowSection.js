"use client";

import { useState } from "react";
import {
  LEAD_CONTACT_TAGS,
  LEAD_PAYMENT_METHODS,
  normalizeContactCounts,
  WORKFLOW_BADGE_CLASS,
} from "@/lib/leadWorkflow";
import { workflowTagDisplayLabel, workflowTagTone } from "@/lib/workflowTagLabels";
import { InfoIcon } from "@/components/Leads/IconTooltipButton";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

function chipClass(active, tone, disabled) {
  const base = active
    ? WORKFLOW_BADGE_CLASS[tone]
    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
  return `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${base}${disabled ? " cursor-not-allowed" : ""}`;
}

function ToggleSwitch({ checked, disabled, onChange, label }) {
  return (
    <label className={`inline-flex items-center gap-2.5 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked
            ? "border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500"
            : "border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
    </label>
  );
}

function ChipLabel({ active, children }) {
  return (
    <>
      {active ? <span aria-hidden className="font-bold">✓ </span> : null}
      <span>{children}</span>
    </>
  );
}

function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAppointmentWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LeadWorkflowSection({
  lead,
  onPatch,
  onReloadActivity,
  setError,
  workflowTagLookup = {},
  isAdmin = false,
}) {
  const [busy, setBusy] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentAt, setAppointmentAt] = useState("");
  const [appointmentNote, setAppointmentNote] = useState("");

  const phase = lead?.leadPhase || "active";
  const phaseTone = workflowTagTone(workflowTagLookup, "phase", phase);
  const phaseLabel = workflowTagDisplayLabel(workflowTagLookup, "phase", phase, { isAdmin, fallback: "Active" });
  const tagsLocked = phase !== "active";
  const paymentLocked = phase === "cancelled";
  const progressTags = lead?.leadProgressTags || [];
  const counts = normalizeContactCounts(lead?.leadContactCounts);
  const processedRequired = Boolean(lead?.leadProcessedRequired);
  const missingVerified = !progressTags.includes("verified");
  const missingProcessed = processedRequired && !progressTags.includes("processed");
  const missingSaleDone = !progressTags.includes("sale_done");
  const saleDoneBlocked = missingVerified || missingProcessed || missingSaleDone;
  const saleDoneHint = (() => {
    const missing = [];
    if (missingVerified) {
      missing.push(
        workflowTagDisplayLabel(workflowTagLookup, "progress", "verified", { isAdmin: true, fallback: "Verified" }),
      );
    }
    if (missingProcessed) {
      missing.push(
        workflowTagDisplayLabel(workflowTagLookup, "progress", "processed", { isAdmin: true, fallback: "Processed" }),
      );
    }
    if (missingSaleDone) {
      missing.push(
        workflowTagDisplayLabel(workflowTagLookup, "progress", "sale_done", { isAdmin: true, fallback: "Sale done" }),
      );
    }
    if (!missing.length) return "";
    if (missing.length === 1) return `Mark ${missing[0]} before Sale close.`;
    const last = missing.pop();
    return `Mark ${missing.join(", ")} and ${last} before Sale close.`;
  })();

  async function patch(payload) {
    setBusy(true);
    setError(null);
    try {
      await onPatch(payload);
      await onReloadActivity?.();
    } catch (e) {
      setError(e.message || "Update failed");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function toggleProgressTag(tag) {
    if (tagsLocked || busy) return;
    const next = progressTags.includes(tag)
      ? progressTags.filter((t) => t !== tag)
      : [...progressTags, tag];
    await patch({ leadProgressTags: next });
  }

  async function toggleProcessingRequired() {
    if (busy || tagsLocked) return;
    if (processedRequired) {
      const nextTags = progressTags.filter((t) => t !== "processed");
      await patch({
        leadProcessedRequired: false,
        ...(nextTags.length !== progressTags.length ? { leadProgressTags: nextTags } : {}),
      });
      return;
    }
    await patch({ leadProcessedRequired: true });
  }

  async function setCallOutcome(tag) {
    if (tagsLocked || busy) return;
    if (tag === "appointment") {
      setAppointmentAt(toDatetimeLocal(lead?.leadContactTag === "appointment" ? "" : lead?.leadAppointmentAt));
      setAppointmentNote(lead?.leadContactTag === "appointment" ? "" : lead?.leadAppointmentNote || "");
      setShowAppointmentModal(true);
      return;
    }
    await patch({ leadContactTag: tag });
  }

  async function clearCallOutcome() {
    if (tagsLocked || busy || !lead?.leadContactTag) return;
    await patch({ leadContactTag: null });
  }

  async function saveAppointment() {
    if (!appointmentAt) {
      setError("Appointment date is required");
      return;
    }
    await patch({
      leadContactTag: "appointment",
      leadAppointmentAt: new Date(appointmentAt).toISOString(),
      leadAppointmentNote: appointmentNote.trim() || null,
    });
    setShowAppointmentModal(false);
  }

  async function togglePayment(method) {
    if (paymentLocked || busy) return;
    if (lead?.leadPaymentMethod === method) {
      await patch({ leadPaymentMethod: null });
      return;
    }
    await patch({ leadPaymentMethod: method });
  }

  async function closeSale() {
    if (busy || phase !== "active") return;
    await patch({ leadPhase: "closed" });
  }

  async function reactivateLead() {
    if (busy || phase !== "cancelled") return;
    await patch({ leadPhase: "active" });
  }

  async function submitCancel() {
    const reason = cancelReason.trim();
    if (!reason) {
      setError("Cancel reason is required");
      return;
    }
    await patch({ leadPhase: "cancelled", leadCancelReason: reason });
    setShowCancelModal(false);
    setCancelReason("");
  }

  function contactLabel(tagDef) {
    const count = counts[tagDef.value] || 0;
    const active = lead?.leadContactTag === tagDef.value;
    const label = workflowTagDisplayLabel(workflowTagLookup, "contact", tagDef.value, {
      isAdmin,
      fallback: tagDef.value,
    });
    if (active && count > 1) return `${label} ×${count}`;
    return label;
  }

  return (
    <section className="mb-6 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
        Lead status
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${WORKFLOW_BADGE_CLASS[phaseTone]}`}>
          {phaseLabel}
        </span>
        {phase === "cancelled" && lead?.leadCancelReason ? (
          <span className="text-xs text-red-700 dark:text-red-300">Reason: {lead.leadCancelReason}</span>
        ) : null}
      </div>

      <div className="mb-4">
        <label className={labelClass}>Lead / sale progress</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || tagsLocked}
            onClick={() => void toggleProgressTag("verified")}
            className={chipClass(progressTags.includes("verified"), "blue", busy || tagsLocked)}
            aria-pressed={progressTags.includes("verified")}
          >
            <ChipLabel active={progressTags.includes("verified")}>
              {workflowTagDisplayLabel(workflowTagLookup, "progress", "verified", { isAdmin, fallback: "Verified" })}
            </ChipLabel>
          </button>
          {processedRequired ? (
            <button
              type="button"
              disabled={busy || tagsLocked}
              onClick={() => void toggleProgressTag("processed")}
              className={chipClass(progressTags.includes("processed"), "violet", busy || tagsLocked)}
              aria-pressed={progressTags.includes("processed")}
            >
              <ChipLabel active={progressTags.includes("processed")}>
                {workflowTagDisplayLabel(workflowTagLookup, "progress", "processed", { isAdmin, fallback: "Processed" })}
              </ChipLabel>
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || tagsLocked}
            onClick={() => void toggleProgressTag("sale_done")}
            className={chipClass(
              progressTags.includes("sale_done"),
              workflowTagTone(workflowTagLookup, "progress", "sale_done", "emerald"),
              busy || tagsLocked,
            )}
            aria-pressed={progressTags.includes("sale_done")}
          >
            <ChipLabel active={progressTags.includes("sale_done")}>
              {workflowTagDisplayLabel(workflowTagLookup, "progress", "sale_done", { isAdmin, fallback: "Sale done" })}
            </ChipLabel>
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Click to check; click again to uncheck.
        </p>
      </div>

      <div className="mb-4">
        <label className={labelClass}>Processing</label>
        <ToggleSwitch
          checked={processedRequired}
          disabled={busy || tagsLocked}
          label="Processing required"
          onChange={() => void toggleProcessingRequired()}
        />
      </div>

      <div className="mb-4">
        <label className={labelClass}>Call outcome</label>
        <div className="flex flex-wrap items-center gap-2">
          {LEAD_CONTACT_TAGS.map((tag) => {
            const active = lead?.leadContactTag === tag.value;
            const tone = workflowTagTone(workflowTagLookup, "contact", tag.value, tag.tone);
            return (
            <button
              key={tag.value}
              type="button"
              disabled={busy || tagsLocked}
              onClick={() => void setCallOutcome(tag.value)}
              className={chipClass(active, tone, busy || tagsLocked)}
              aria-pressed={active}
            >
              <ChipLabel active={active}>{contactLabel(tag)}</ChipLabel>
            </button>
            );
          })}
          {lead?.leadContactTag ? (
            <button
              type="button"
              disabled={busy || tagsLocked}
              onClick={() => void clearCallOutcome()}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Clear
            </button>
          ) : null}
        </div>
        {lead?.leadContactTag === "appointment" && lead?.leadAppointmentAt ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            {formatAppointmentWhen(lead.leadAppointmentAt)}
            {lead.leadAppointmentNote ? ` — ${lead.leadAppointmentNote}` : ""}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Click to log call outcome; click the same outcome again to log another call. Use Clear to remove the current outcome.
        </p>
      </div>

      <div className="mb-4">
        <label className={labelClass}>Payment collected</label>
        <div className="flex flex-wrap gap-2">
          {LEAD_PAYMENT_METHODS.map((method) => {
            const active = lead?.leadPaymentMethod === method.value;
            const tone = workflowTagTone(workflowTagLookup, "payment", method.value, method.tone);
            return (
            <button
              key={method.value}
              type="button"
              disabled={busy || paymentLocked}
              onClick={() => void togglePayment(method.value)}
              className={chipClass(active, tone, busy || paymentLocked)}
              aria-pressed={active}
            >
              <ChipLabel active={active}>
                {workflowTagDisplayLabel(workflowTagLookup, "payment", method.value, {
                  isAdmin,
                  fallback: method.label,
                })}
              </ChipLabel>
            </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Click to select; click again to clear.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {phase === "active" ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy || saleDoneBlocked}
              onClick={() => void closeSale()}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
            >
              {workflowTagDisplayLabel(workflowTagLookup, "phase", "closed", { isAdmin, fallback: "Sale close" })}
            </button>
            {saleDoneBlocked ? (
              <span
                title={saleDoneHint}
                aria-label={saleDoneHint}
                className="inline-flex h-7 w-7 shrink-0 cursor-help items-center justify-center rounded-lg text-amber-700 dark:text-amber-300"
              >
                <InfoIcon className="h-4 w-4" />
              </span>
            ) : null}
          </div>
        ) : null}
        {phase === "cancelled" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reactivateLead()}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            Reactivate lead
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || phase === "cancelled"}
          onClick={() => {
            setCancelReason(lead?.leadCancelReason || "");
            setShowCancelModal(true);
          }}
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          Cancel lead
        </button>
      </div>

      {showAppointmentModal ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-zinc-950/50"
            aria-label="Close appointment form"
            onClick={() => setShowAppointmentModal(false)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Set appointment</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className={labelClass}>Date & time *</label>
                  <input
                    type="datetime-local"
                    value={appointmentAt}
                    onChange={(e) => setAppointmentAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Note (optional)</label>
                  <textarea
                    value={appointmentNote}
                    onChange={(e) => setAppointmentNote(e.target.value)}
                    rows={3}
                    className={`${inputClass} min-h-[72px] resize-y`}
                    placeholder="Optional appointment details…"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAppointmentModal(false)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveAppointment()}
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  Save appointment
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showCancelModal ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-zinc-950/50"
            aria-label="Close cancel form"
            onClick={() => setShowCancelModal(false)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Cancel lead</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Enter a reason for cancelling this lead.</p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={4}
                className={`${inputClass} mt-4 min-h-[96px] resize-y`}
                placeholder="Cancel reason…"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitCancel()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm cancel
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
