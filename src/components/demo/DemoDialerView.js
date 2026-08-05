"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/formatDuration";
import { formatLandline, validatePhone } from "@/lib/phoneFormat";
import { CALL_STATUS_LABELS } from "@/lib/demo/seed";
import { useDemo } from "@/lib/demo/DemoProvider";
import DemoActiveCallPanel from "./DemoActiveCallPanel";

function timeAgo(ts) {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DemoDialerView() {
  const { state, startCall, redialFromLog, helpers } = useDemo();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [validation, setValidation] = useState({ isValid: true, message: "" });
  const [error, setError] = useState(null);
  const hasActiveCall = Boolean(state.activeCall);

  function onPhoneChange(e) {
    const formatted = formatLandline(e.target.value);
    setPhone(formatted);
    setValidation(validatePhone(formatted));
    setError(null);
  }

  function onDial() {
    const v = validatePhone(phone);
    setValidation(v);
    if (!v.isValid || hasActiveCall) return;
    startCall({ phone, name });
    setPhone("");
    setName("");
    setValidation({ isValid: true, message: "" });
    setError(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-sky-200/90 bg-gradient-to-br from-white via-sky-50/50 to-indigo-50/45 shadow-2xl shadow-sky-500/15 ring-1 ring-sky-300/40">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-400/20 to-transparent"
            aria-hidden
          />
          <div className="relative p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/80 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">
                  Outbound Console
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                  Dialer
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Demo Voice Ready
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_10px_30px_rgba(56,189,248,0.12)] backdrop-blur-sm">
              <div>
                <label
                  htmlFor="demo-dial-phone"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-700"
                >
                  Phone number
                </label>
                <input
                  id="demo-dial-phone"
                  type="tel"
                  value={phone}
                  onChange={onPhoneChange}
                  placeholder="123-456-7890"
                  disabled={hasActiveCall}
                  maxLength={12}
                  className="w-full rounded-xl border-2 border-sky-200 px-5 py-4 font-mono text-xl text-zinc-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 disabled:opacity-50"
                />
                {!validation.isValid ? (
                  <p className="mt-1.5 text-sm text-rose-600">{validation.message}</p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="demo-dial-name"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-700"
                >
                  Customer name
                </label>
                <input
                  id="demo-dial-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional"
                  disabled={hasActiveCall}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 disabled:opacity-50"
                />
              </div>
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <button
                type="button"
                onClick={onDial}
                disabled={hasActiveCall || !phone.trim() || !validation.isValid}
                className="w-full rounded-2xl bg-sky-600 px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hasActiveCall ? "Call in progress…" : "Place call"}
              </button>
              <p className="text-xs text-zinc-500">
                Simulated softphone — no Twilio required. Try mute, DTMF, record, and conference.
              </p>
            </div>
          </div>
        </section>

        <DemoActiveCallPanel />
      </div>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Call logs</h2>
            <p className="text-sm text-zinc-500">Recent outbound activity</p>
          </div>
          <p className="text-sm font-semibold text-sky-700">
            {state.metrics.callsToday} today
          </p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {state.callLogs.map((c) => {
            const agent = helpers.getUser(c.agentId);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-950">{c.customerName}</p>
                  <p className="font-mono text-sm text-zinc-600">{c.phoneLabel}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {CALL_STATUS_LABELS[c.status] || c.status}
                    {" · "}
                    {formatDuration(c.durationSeconds)}
                    {c.conference ? " · Conference" : ""}
                    {c.recording ? " · Rec" : ""}
                    {" · "}
                    {agent?.displayName || "Agent"}
                    {" · "}
                    {timeAgo(c.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={hasActiveCall}
                  onClick={() => redialFromLog(c.id)}
                  className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 disabled:opacity-40"
                >
                  Redial
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
