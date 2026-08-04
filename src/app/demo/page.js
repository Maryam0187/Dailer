"use client";

import Link from "next/link";
import DemoShell from "@/components/demo/DemoShell";
import { useDemo } from "@/lib/demo/DemoProvider";
import { CALL_STATUS_LABELS } from "@/lib/demo/seed";

const script = [
  "Open Dialer → place a call → watch connect → ring → in-progress",
  "On the live call: mute, keypad DTMF, start recording",
  "Add supervisor (conference) → hang up → see the call log",
  "Open Leads → filter Active → dial Jamie Ortiz from a lead card",
  "Open a lead → toggle Verified / Sale done → Close sale",
  "Open Messages → reply in Floor chat (try two tabs + Reset)",
  "Open Team → switch identity to Sam (supervisor) → send a DM",
];

export default function DemoHubPage() {
  const { state, helpers } = useDemo();
  const stats = helpers.leadStats();
  const recentCalls = state.callLogs.slice(0, 4);
  const activeLeads = state.leads.filter((l) => l.phase === "active").slice(0, 4);

  return (
    <DemoShell
      title="Presenter hub"
      subtitle="Walk an ops or sales lead through the product. No login, no Twilio — state stays in this browser."
    >
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">
            Demo script
          </h2>
          <ol className="mt-4 space-y-3">
            {script.map((step, i) => (
              <li key={step} className="flex gap-3 text-zinc-600">
                <span className="text-xl font-semibold tabular-nums text-sky-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="pt-1 leading-7 text-zinc-900">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              { href: "/demo/dialer", label: "Agent dialer", hint: "Softphone + call logs" },
              { href: "/demo/leads", label: "Leads CRM", hint: "Workflow + payments" },
              { href: "/demo/messages", label: "Team messages", hint: "Floor + DMs" },
              { href: "/demo/team", label: "Team & metrics", hint: "Roles + presence" },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-2xl border border-sky-200/80 bg-white p-5 shadow-sm transition hover:border-sky-400 hover:shadow-md"
              >
                <p className="font-semibold text-zinc-950">{card.label}</p>
                <p className="mt-1 text-sm text-zinc-600">{card.hint}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">
            Live snapshot
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { label: "Calls today", value: state.metrics.callsToday },
              { label: "Active leads", value: stats.active },
              { label: "Sales closed", value: state.metrics.salesClosed },
              {
                label: "Unread msgs",
                value: helpers.unreadTotal(state.currentUserId),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
            Recent calls
          </h3>
          <ul className="mt-3 space-y-2">
            {recentCalls.map((c) => (
              <li key={c.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                {c.customerName} · {CALL_STATUS_LABELS[c.status] || c.status}
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
            Active leads
          </h3>
          <ul className="mt-3 space-y-2">
            {activeLeads.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/demo/leads/${l.id}`}
                  className="block rounded-lg bg-emerald-50/80 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-100"
                >
                  {l.name} · {l.phone}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/sign-in"
            className="mt-6 flex w-full items-center justify-center rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Ready for the real app? Sign in
          </Link>
        </section>
      </div>
    </DemoShell>
  );
}
