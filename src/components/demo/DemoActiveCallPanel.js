"use client";

import { useEffect, useState } from "react";
import { useDemo } from "@/lib/demo/DemoProvider";

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function DemoActiveCallPanel() {
  const {
    state,
    advanceCallPhase,
    toggleMute,
    toggleKeypad,
    sendDtmf,
    toggleRecording,
    upgradeToConference,
    endCall,
  } = useDemo();
  const call = state.activeCall;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!call) return undefined;
    if (call.phase === "connecting") {
      const t = window.setTimeout(() => advanceCallPhase(), 900);
      return () => window.clearTimeout(t);
    }
    if (call.phase === "ringing") {
      const t = window.setTimeout(() => advanceCallPhase(), 1400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [call, advanceCallPhase]);

  useEffect(() => {
    if (!call || call.phase !== "in_progress" || !call.startedAt) {
      return undefined;
    }
    const startedAt = call.startedAt;
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [call]);

  if (!call) return null;

  const statusLabel =
    call.phase === "connecting"
      ? "Connecting agent…"
      : call.phase === "ringing"
        ? "Ringing customer…"
        : "In progress";

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-xl shadow-emerald-500/15 ring-1 ring-emerald-200/70">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-200/70 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Active call
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
            {call.customerName}
          </h3>
          <p className="font-mono text-sm text-zinc-600">{call.phoneLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-emerald-800">{statusLabel}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-950">
            {call.phase === "in_progress" ? formatTimer(elapsed) : "00:00"}
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {call.conference ? (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">
              Conference
            </span>
          ) : null}
          {call.recording ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              Recording
            </span>
          ) : null}
          {call.muted ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Muted
            </span>
          ) : null}
        </div>

        {call.conference ? (
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Participants
            </p>
            <ul className="mt-2 space-y-1.5">
              {call.participants.map((p) => (
                <li key={p.id} className="text-sm text-zinc-800">
                  {p.name}{" "}
                  <span className="text-xs text-zinc-500">({p.role})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={call.phase !== "in_progress"}
            onClick={toggleMute}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-40"
          >
            {call.muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            disabled={call.phase !== "in_progress"}
            onClick={toggleKeypad}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-40"
          >
            Keypad
          </button>
          <button
            type="button"
            disabled={call.phase !== "in_progress"}
            onClick={toggleRecording}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-40"
          >
            {call.recording ? "Stop rec" : "Record"}
          </button>
          <button
            type="button"
            disabled={call.phase !== "in_progress" || call.conference}
            onClick={upgradeToConference}
            className="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-40"
          >
            Add supervisor
          </button>
          <button
            type="button"
            onClick={() => endCall("completed")}
            className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Hang up
          </button>
        </div>

        {call.showKeypad ? (
          <div>
            <p className="mb-2 font-mono text-sm text-zinc-600">
              DTMF: {call.dtmf || "—"}
            </p>
            <div className="grid max-w-xs grid-cols-3 gap-2">
              {DTMF_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => sendDtmf(key)}
                  className="rounded-xl border border-zinc-300 bg-white py-3 font-mono text-lg font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
