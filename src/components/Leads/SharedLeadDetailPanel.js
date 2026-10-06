"use client";

import Link from "next/link";
import { formatLeadPhoneDisplay } from "@/lib/maskPhone";
import { formatLeadService } from "@/lib/leadService";
import CopyPhoneButton from "@/components/Leads/CopyPhoneButton";
import IconTooltipButton, { CloseIcon, ExpandIcon } from "@/components/Leads/IconTooltipButton";
import { RichHtmlContent } from "@/components/Leads/RichTextEditor";
import { isEmptyRichText } from "@/lib/richText";
import { WORKFLOW_BADGE_CLASS } from "@/lib/leadWorkflow";
import {
  formatLeadStatusShortWithTags,
  formatLeadWorkflowTooltipSummary,
  workflowTagTone,
} from "@/lib/workflowTagLabels";

const labelClass =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

function formatLeadName(lead) {
  return lead?.fullName?.trim() || "—";
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

function Field({ label, children }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{children || "—"}</dd>
    </div>
  );
}

function StatusBadge({ lead, workflowTagLookup, preferShortLabels }) {
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

export default function SharedLeadDetailPanel({
  lead,
  onClose,
  phonesRedacted = false,
  workflowTagLookup = {},
  preferShortLabels = true,
  variant = "drawer",
  showFullPageLink = true,
}) {
  const isPage = variant === "page";
  const Shell = isPage ? "div" : "aside";
  const isCancelled = lead?.leadPhase === "cancelled";

  return (
    <>
      {!isPage ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-zinc-950/40"
          aria-label="Close lead detail"
          onClick={onClose}
        />
      ) : null}
      <Shell
        className={
          isPage
            ? "flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            : "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        }
      >
        <div className="border-b border-sky-200 bg-sky-50 px-5 py-4 dark:border-sky-900/50 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
                Shared view
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatLeadName(lead)}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="inline-flex items-center gap-1 font-mono">
                  {!phonesRedacted && !lead.phonesRedacted ? (
                    <CopyPhoneButton phone={lead.phone} className="h-6 w-6" />
                  ) : null}
                  {formatLeadPhoneDisplay(lead.phone, phonesRedacted || lead.phonesRedacted)}
                </span>
                {lead.cellNumber ? (
                  <span className="inline-flex items-center gap-1 font-mono text-zinc-600 dark:text-zinc-400">
                    Cell:{" "}
                    {!phonesRedacted && !lead.phonesRedacted ? (
                      <CopyPhoneButton phone={lead.cellNumber} className="h-6 w-6" />
                    ) : null}
                    {formatLeadPhoneDisplay(lead.cellNumber, phonesRedacted || lead.phonesRedacted)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-1.5">
              {showFullPageLink ? (
                <Link
                  href={`/leads/${lead.id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  title="Open full page"
                  aria-label="Open full page"
                >
                  <ExpandIcon className="h-4 w-4" />
                </Link>
              ) : null}
              {!isPage ? (
                <IconTooltipButton title="Close" onClick={onClose}>
                  <CloseIcon />
                </IconTooltipButton>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-sky-900/80 dark:text-sky-200/80">
            View-only shared sale. Activity, calls, and editing are not available.
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sale info</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Lead status">
                <StatusBadge
                  lead={lead}
                  workflowTagLookup={workflowTagLookup}
                  preferShortLabels={preferShortLabels}
                />
              </Field>
              <Field label="Service">
                <span className="font-bold">{formatLeadService(lead)}</span>
              </Field>
              <Field label="Sale created">{formatDateTime(lead.createdAt)}</Field>
              <Field label="Last updated">{formatDateTime(lead.updatedAt)}</Field>
            </dl>
            {isCancelled || lead.leadCancelReason ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                <p className={labelClass}>Cancel notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-red-950 dark:text-red-100">
                  {lead.leadCancelReason?.trim() || "No cancel reason recorded."}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Customer</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Name">{formatLeadName(lead)}</Field>
              <Field label="Phone">
                <span className="inline-flex items-center gap-1 font-mono">
                  {!phonesRedacted && !lead.phonesRedacted ? (
                    <CopyPhoneButton phone={lead.phone} className="h-6 w-6" />
                  ) : null}
                  {formatLeadPhoneDisplay(lead.phone, phonesRedacted || lead.phonesRedacted)}
                </span>
              </Field>
              <Field label="Cell">
                {lead.cellNumber ? (
                  <span className="inline-flex items-center gap-1 font-mono">
                    {!phonesRedacted && !lead.phonesRedacted ? (
                      <CopyPhoneButton phone={lead.cellNumber} className="h-6 w-6" />
                    ) : null}
                    {formatLeadPhoneDisplay(lead.cellNumber, phonesRedacted || lead.phonesRedacted)}
                  </span>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Email">{lead.email}</Field>
              <Field label="Company">{lead.company}</Field>
              <Field label="Location">
                {[lead.city, lead.state, lead.zipCode].filter(Boolean).join(", ") || "—"}
              </Field>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Lead notes</h3>
            {isEmptyRichText(lead.notes) ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No notes.</p>
            ) : (
              <RichHtmlContent
                html={lead.notes}
                className="mt-2 text-sm text-zinc-800 dark:text-zinc-200"
              />
            )}
          </section>

          <section className="rounded-2xl border border-violet-200/80 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Breakdown notes
            </h3>
            {isEmptyRichText(lead.breakdown) ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No breakdown notes.</p>
            ) : (
              <RichHtmlContent
                html={lead.breakdown}
                className="mt-2 text-sm text-zinc-800 dark:text-zinc-200"
              />
            )}
          </section>
        </div>
      </Shell>
    </>
  );
}
