"use client";

import { useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

export default function SalesBotLiveCallClient() {
  const [toNumber, setToNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  async function startCall() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch("/api/sales-bot/calls/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toNumber }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start call");
      setActiveCall({
        callId: json.call?.id,
        conferenceName: json.conferenceName,
        toNumber: json.call?.toNumber || toNumber,
      });
      setInfo(
        json.message ||
          "Softphone should ring — answer to listen. AI speaks when the customer answers.",
      );
    } catch (err) {
      setError(err?.message || "Failed to start");
      setActiveCall(null);
    } finally {
      setBusy(false);
    }
  }

  async function stopCall() {
    if (!activeCall?.callId) {
      setActiveCall(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-bot/calls/stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: activeCall.callId,
          conferenceName: activeCall.conferenceName,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to stop");
      setActiveCall(null);
      setInfo("Call ended.");
    } catch (err) {
      setError(err?.message || "Failed to stop");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Live call — Start AI Bot</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter one number and start. Your softphone rings so you can listen (muted). The AI greets and
        pitches as soon as the customer answers — not mid-call like Address Bot.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label className={labelClass} htmlFor="sales-bot-to">
            Phone number
          </label>
          <input
            id="sales-bot-to"
            className={inputClass}
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value)}
            placeholder="+1…"
            disabled={busy || Boolean(activeCall)}
          />
        </div>
        {!activeCall ? (
          <button
            type="button"
            onClick={() => void startCall()}
            disabled={busy || !toNumber.trim()}
            className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Starting…" : "Start AI Bot"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopCall()}
            disabled={busy}
            className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      {activeCall ? (
        <p className="mt-3 text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Live with {activeCall.toNumber} (call #{activeCall.callId}). Answer the softphone to listen.
        </p>
      ) : null}
      {info ? (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{info}</p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
