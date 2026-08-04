"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  LEAD_CONTACT_TAGS,
  LEAD_PHASES,
  LEAD_PROGRESS_TAGS,
  WORKFLOW_BADGE_CLASS,
} from "@/lib/leadWorkflow";
import { useDemo } from "@/lib/demo/DemoProvider";

function Badge({ label, tone }) {
  const cls = WORKFLOW_BADGE_CLASS[tone] || WORKFLOW_BADGE_CLASS.zinc;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function phaseMeta(phase) {
  return LEAD_PHASES.find((p) => p.value === phase) || { label: phase, tone: "zinc" };
}

function progressMeta(tag) {
  return LEAD_PROGRESS_TAGS.find((t) => t.value === tag) || { label: tag, tone: "zinc" };
}

function contactMeta(tag) {
  return LEAD_CONTACT_TAGS.find((t) => t.value === tag) || { label: tag, tone: "zinc" };
}

export default function DemoLeadsView() {
  const { state, createLead, dialLead, helpers } = useDemo();
  const stats = helpers.leadStats();
  const [filter, setFilter] = useState("active");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const leads = useMemo(() => {
    return state.leads.filter((l) => {
      if (filter === "all") return true;
      return l.phase === filter;
    });
  }, [state.leads, filter]);

  function onCreate(e) {
    e.preventDefault();
    createLead({ name, phone });
    setName("");
    setPhone("");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active", value: stats.active, tone: "text-emerald-700" },
          { label: "Sale close", value: stats.closed, tone: "text-zinc-800" },
          { label: "Verified", value: stats.verified, tone: "text-amber-700" },
          { label: "Sale done", value: stats.saleDone, tone: "text-sky-700" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${card.tone}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: "active", label: "Active" },
          { value: "closed", label: "Sale close" },
          { value: "cancelled", label: "Cancelled" },
          { value: "all", label: "All" },
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === f.value
                ? "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={onCreate}
        className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="New lead name"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="555-123-4567"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add lead
        </button>
      </form>

      <ul className="space-y-3">
        {leads.map((lead) => {
          const phase = phaseMeta(lead.phase);
          const assignee = helpers.getUser(lead.assigneeId);
          return (
            <li
              key={lead.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-300/70"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/demo/leads/${lead.id}`}
                    className="text-lg font-semibold tracking-tight text-zinc-950 hover:text-emerald-700"
                  >
                    {lead.name}
                  </Link>
                  <p className="mt-0.5 font-mono text-sm text-zinc-600">{lead.phone}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {lead.serviceType} · {assignee?.displayName || "Unassigned"}
                    {lead.amount ? ` · $${lead.amount}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(state.activeCall)}
                    onClick={() => dialLead(lead.id)}
                    className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 disabled:opacity-40"
                  >
                    Dial
                  </button>
                  <Link
                    href={`/demo/leads/${lead.id}`}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                  >
                    Open
                  </Link>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge label={phase.label} tone={phase.tone} />
                {lead.progressTags.map((tag) => {
                  const meta = progressMeta(tag);
                  return <Badge key={tag} label={meta.label} tone={meta.tone} />;
                })}
                {lead.contactTags.map((tag) => {
                  const meta = contactMeta(tag);
                  return <Badge key={tag} label={meta.label} tone={meta.tone} />;
                })}
              </div>
            </li>
          );
        })}
        {leads.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
            No leads in this filter.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
