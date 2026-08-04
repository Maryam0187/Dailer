"use client";

import Link from "next/link";
import {
  LEAD_CONTACT_TAGS,
  LEAD_PAYMENT_METHODS,
  LEAD_PHASES,
  LEAD_PROGRESS_TAGS,
  WORKFLOW_BADGE_CLASS,
} from "@/lib/leadWorkflow";
import { useDemo } from "@/lib/demo/DemoProvider";

function ChipButton({ active, tone, children, onClick }) {
  const cls = active
    ? WORKFLOW_BADGE_CLASS[tone] || WORKFLOW_BADGE_CLASS.zinc
    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${cls}`}
    >
      {children}
    </button>
  );
}

export default function DemoLeadDetailView({ leadId }) {
  const {
    helpers,
    setLeadPhase,
    toggleLeadProgressTag,
    setLeadContactTag,
    setLeadPayment,
    updateLeadNotes,
    dialLead,
    closeSale,
    state,
  } = useDemo();

  const lead = helpers.getLead(leadId);
  if (!lead) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Lead not found.{" "}
        <Link href="/demo/leads" className="font-semibold text-emerald-700">
          Back to leads
        </Link>
      </div>
    );
  }

  const assignee = helpers.getUser(lead.assigneeId);
  const processor = helpers.getUser(lead.processorId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/demo/leads" className="text-xs font-semibold text-emerald-700">
            ← All leads
          </Link>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{lead.name}</h2>
          <p className="font-mono text-zinc-600">{lead.phone}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {lead.email || "No email"} · {lead.serviceType}
            {lead.amount ? ` · $${lead.amount}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(state.activeCall)}
            onClick={() => dialLead(lead.id)}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Dial lead
          </button>
          <button
            type="button"
            onClick={() => closeSale(lead.id)}
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900"
          >
            Close sale
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Workflow phase
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {LEAD_PHASES.map((p) => (
              <ChipButton
                key={p.value}
                active={lead.phase === p.value}
                tone={p.tone}
                onClick={() => setLeadPhase(lead.id, p.value)}
              >
                {p.label}
              </ChipButton>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Progress tags
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {LEAD_PROGRESS_TAGS.map((t) => (
              <ChipButton
                key={t.value}
                active={lead.progressTags.includes(t.value)}
                tone={t.tone}
                onClick={() => toggleLeadProgressTag(lead.id, t.value)}
              >
                {t.label}
              </ChipButton>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Contact outcome
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {LEAD_CONTACT_TAGS.map((t) => (
              <ChipButton
                key={t.value}
                active={lead.contactTags.includes(t.value)}
                tone={t.tone}
                onClick={() => setLeadContactTag(lead.id, t.value)}
              >
                {t.label}
              </ChipButton>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Payment
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {LEAD_PAYMENT_METHODS.map((m) => (
              <ChipButton
                key={m.value}
                active={lead.paymentMethod === m.value}
                tone={m.tone}
                onClick={() =>
                  setLeadPayment(lead.id, {
                    paymentMethod: lead.paymentMethod === m.value ? null : m.value,
                  })
                }
              >
                {m.label}
              </ChipButton>
            ))}
          </div>

          <div className="mt-6 space-y-2 text-sm text-zinc-700">
            <p>
              <span className="font-semibold text-zinc-500">Assignee:</span>{" "}
              {assignee?.displayName || "—"}
            </p>
            <p>
              <span className="font-semibold text-zinc-500">Processor:</span>{" "}
              {processor?.displayName || "—"}
            </p>
            <p>
              <span className="font-semibold text-zinc-500">Charge:</span>{" "}
              {lead.paymentChargeStatus || "pending"}
              {lead.paymentProcessor ? ` · ${lead.paymentProcessor}` : ""}
            </p>
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Notes
          </h3>
          <textarea
            value={lead.notes || ""}
            onChange={(e) => updateLeadNotes(lead.id, e.target.value)}
            rows={5}
            className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </section>
      </div>
    </div>
  );
}
