"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ivrChoiceLabel } from "@/lib/ivrChoiceLabel";
import { useDemo } from "@/lib/demo/DemoProvider";
import DemoActiveCallPanel from "./DemoActiveCallPanel";

const PHASE_STEPS = [
  { key: "incoming", label: "Incoming", hint: "Caller hits Studio flow" },
  { key: "gather", label: "Gather", hint: "Menu digit captured" },
  { key: "ringing", label: "Ringing", hint: "Admin softphone rings" },
];

function eventLabel(type) {
  if (type === "incoming") return "Incoming";
  if (type === "gather") return "Gather update";
  if (type === "ringing") return "Ringing admin";
  return type || "Update";
}

function formatWhen(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function phaseIndex(phase) {
  if (phase === "holding" || phase === "ended") return 3;
  return PHASE_STEPS.findIndex((s) => s.key === phase);
}

export default function DemoIvrView() {
  const {
    state,
    simulateInboundIvr,
    advanceIvrPhase,
    acceptIvrCall,
    declineIvrCall,
    markIvrRead,
    markAllIvrRead,
    setAdminOnlineForIvr,
    setCurrentUser,
    helpers,
  } = useDemo();

  const me = helpers.getUser(state.currentUserId);
  const session = state.ivrSession;
  const admin = helpers.getUser("u-admin");
  const adminOnline = admin?.presence === "online";
  const unread = helpers.ivrUnreadTotal();
  const live = session && session.phase !== "ended";
  const hasActiveCall = Boolean(state.activeCall);

  useEffect(() => {
    if (!session) return undefined;
    if (session.phase === "incoming") {
      const t = window.setTimeout(() => advanceIvrPhase(), 1200);
      return () => window.clearTimeout(t);
    }
    if (session.phase === "gather") {
      const t = window.setTimeout(() => advanceIvrPhase(), 1400);
      return () => window.clearTimeout(t);
    }
    if (session.phase === "holding") {
      const t = window.setTimeout(() => advanceIvrPhase(), 2200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [session, advanceIvrPhase]);

  const currentIdx = session ? phaseIndex(session.phase) : -1;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-sky-200/90 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/40 shadow-2xl shadow-sky-500/15 ring-1 ring-sky-300/40">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-400/20 to-transparent"
            aria-hidden
          />
          <div className="relative space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-200/80 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">
                  Inbound console
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                  IVR
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Simulate Studio incoming → menu gather → admin ring → answer or decline.
                </p>
              </div>
              {live ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  Live IVR
                </span>
              ) : null}
            </div>

            {me?.role !== "admin" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                Switch to{" "}
                <button
                  type="button"
                  onClick={() => setCurrentUser("u-admin")}
                  className="font-semibold underline underline-offset-2"
                >
                  Jordan Admin
                </button>{" "}
                to see staff alerts. Simulate also switches you automatically.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={live || hasActiveCall}
                onClick={() => simulateInboundIvr({ knownCustomer: true, choice: "1" })}
                className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
              >
                Simulate inbound (known caller)
              </button>
              <button
                type="button"
                disabled={live || hasActiveCall}
                onClick={() => simulateInboundIvr({ knownCustomer: false, choice: "0" })}
                className="rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-950 hover:bg-sky-50 disabled:opacity-40"
              >
                Unknown caller
              </button>
              <button
                type="button"
                onClick={() => setAdminOnlineForIvr(!adminOnline)}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Admin {adminOnline ? "online" : "offline"} — toggle
              </button>
            </div>

            <ol className="grid gap-2 sm:grid-cols-3">
              {PHASE_STEPS.map((step, i) => {
                const active = currentIdx === i;
                const done = currentIdx > i;
                return (
                  <li
                    key={step.key}
                    className={`rounded-2xl border px-3 py-3 ${
                      active
                        ? "border-sky-400 bg-sky-50 ring-1 ring-sky-300"
                        : done
                          ? "border-emerald-200 bg-emerald-50/70"
                          : "border-zinc-200 bg-white/80"
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-950">{step.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{step.hint}</p>
                  </li>
                );
              })}
            </ol>

            {session ? (
              <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Current session
                    </p>
                    <p className="mt-1 font-mono text-sm text-zinc-800">{session.callSid}</p>
                    <p className="mt-2 text-sm text-zinc-800">
                      From{" "}
                      <span className="font-semibold">
                        {session.customer?.fullName || "Unknown"}
                      </span>{" "}
                      · {session.fromLabel}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Choice:{" "}
                      {ivrChoiceLabel(session.choice, { empty: "(waiting…)", prefix: false })}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Phase: {session.phase}
                      {session.outcome ? ` · ${session.outcome}` : ""}
                    </p>
                  </div>
                </div>

                {session.phase === "holding" ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    No admin online — caller hears hold music, then a busy / try-later message.
                  </p>
                ) : null}

                {session.phase === "ended" && session.outcome === "declined" ? (
                  <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    Declined — caller hears thanks, we&apos;ll call you back.
                  </p>
                ) : null}

                {session.phase === "ended" && session.outcome === "busy" ? (
                  <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    Busy path — no agent available to take the call.
                  </p>
                ) : null}

                {session.phase === "ringing" ? (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <h3 className="text-sm font-semibold text-zinc-900">Incoming IVR Call</h3>
                    <p className="mt-1 text-xs text-zinc-600">
                      A caller finished the IVR and is waiting. Answer to connect.
                    </p>
                    <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-sky-900">
                      Caller: {session.fromLabel}
                      {session.customer ? ` · ${session.customer.fullName}` : ""}
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={declineIvrCall}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={acceptIvrCall}
                        className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
                      >
                        Answer Call
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-4 py-6 text-center text-sm text-zinc-500">
                No live IVR session. Run a simulation to walk the inbound flow.
              </p>
            )}
          </div>
        </section>

        {hasActiveCall && state.activeCall?.callKind === "ivr" ? (
          <DemoActiveCallPanel />
        ) : null}

        {hasActiveCall && state.activeCall?.callKind === "ivr" ? (
          <p className="text-sm text-zinc-600">
            Connected inbound — mute, keypad, and hang up work the same as outbound.{" "}
            <Link href="/demo/dialer" className="font-semibold text-sky-700 underline-offset-2 hover:underline">
              Open dialer
            </Link>
          </p>
        ) : null}
      </div>

      <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">IVR notifications</h2>
            <p className="mt-0.5 text-sm text-zinc-600">
              {unread > 0 ? (
                <>
                  <span className="font-semibold text-sky-700">{unread} unread</span>
                  {" · "}
                </>
              ) : null}
              Inbox for inbound calls and gather answers
            </p>
          </div>
          <button
            type="button"
            disabled={unread === 0}
            onClick={markAllIvrRead}
            className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>

        {(state.ivrNotifications || []).length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            No IVR notifications yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {state.ivrNotifications.map((row) => {
              const isUnread = !row.readAt;
              return (
                <li
                  key={row.id}
                  className={`flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between ${
                    isUnread ? "bg-sky-50/70" : ""
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isUnread ? (
                        <span className="inline-flex rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          New
                        </span>
                      ) : null}
                      <span className="text-sm font-semibold text-zinc-900">
                        {row.fromNumber || "Unknown caller"}
                      </span>
                      <span className="text-xs text-zinc-500">{eventLabel(row.lastEventType)}</span>
                    </div>
                    {row.customer ? (
                      <p className="text-xs text-zinc-600">
                        Caller:{" "}
                        <Link
                          href={`/demo/leads/${row.customer.id}`}
                          className="font-medium text-sky-700 underline underline-offset-2"
                        >
                          {row.customer.fullName} ({row.customer.phone})
                        </Link>
                      </p>
                    ) : null}
                    <p className="text-xs text-zinc-600">
                      Choice: {ivrChoiceLabel(row.choice, { empty: "—", prefix: false })}
                    </p>
                    <p className="text-xs text-zinc-500">
                      To {row.toNumber || "—"} · Updated {formatWhen(row.updatedAt || row.createdAt)}
                    </p>
                  </div>
                  {isUnread ? (
                    <button
                      type="button"
                      onClick={() => markIvrRead([row.id])}
                      className="shrink-0 self-start rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                    >
                      Mark read
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
