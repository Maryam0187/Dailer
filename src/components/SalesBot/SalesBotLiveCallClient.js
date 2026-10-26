"use client";

import { useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { digitsOnly, formatLandline } from "@/lib/phoneFormat";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

export default function SalesBotLiveCallClient() {
  const { beginSession, session, endCall, patchSession } = useActiveCall();
  const {
    ensureRegistered,
    expectOutgoingIncomingLeg,
    registered,
    sdkInitializing,
    setCallMuted,
    voiceConnected,
  } = useTwilioVoice();

  const [toNumber, setToNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const inLiveCall = Boolean(session?.callId && session?.callOwnedByMe);
  const activeSalesCall =
    session?.callOwnedByMe &&
    (session?.dialMode === "sales_bot" || session?.salesBotAttached);

  // Listen-only: keep mic muted once the softphone is up on a sales-bot call.
  useEffect(() => {
    if (!activeSalesCall || !voiceConnected || !setCallMuted) return;
    setCallMuted(true);
  }, [activeSalesCall, voiceConnected, setCallMuted]);

  async function startCall() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (session?.callId) {
        throw new Error("End your current dialer call before starting Sales Bot.");
      }

      const raw = String(toNumber || "").trim();
      const toDigits = digitsOnly(raw);
      if (toDigits.length < 7) {
        throw new Error("Enter a valid phone number");
      }

      // Softphone must be ready so the dialer popup can take the incoming Client leg.
      expectOutgoingIncomingLeg(60000);
      if (!registered || sdkInitializing) {
        const ok = await ensureRegistered();
        if (!ok) throw new Error("Dialer is not ready. Open the Dialer page and try again.");
      }

      setInfo("Opening dialer and connecting AI bot…");

      const res = await fetch("/api/sales-bot/calls/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toNumber: toDigits }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start");

      // Opens the global dialer popup (same session model as Quick Dial).
      beginSession({
        callId: json.call.id,
        callOwnedByMe: true,
        callMode: "conference",
        dialMode: "sales_bot",
        toNumber: json.call.toNumber || toDigits,
        phoneLabel: raw || formatLandline(toDigits),
        customerName: "Sales Bot call",
        conferenceName: json.conferenceName || json.call?.conferenceName || undefined,
        salesBotAttached: true,
      });

      if (patchSession) {
        patchSession({
          conferenceName: json.conferenceName,
          callMode: "conference",
          dialMode: "sales_bot",
          salesBotAttached: true,
        });
      }

      setInfo(
        json.message ||
          "Dialer open. AI bot is already in the conference (before the customer answers). You are muted to listen.",
      );
    } catch (err) {
      setError(err?.message || "Failed to start");
    } finally {
      setBusy(false);
    }
  }

  async function stopCall() {
    setBusy(true);
    setError(null);
    try {
      const callId = Number(session?.callId);
      if (Number.isInteger(callId) && callId > 0) {
        await fetch("/api/sales-bot/calls/stop", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId,
            conferenceName: session?.conferenceName || "",
          }),
        }).catch(() => {});
      }
      if (typeof endCall === "function") {
        await endCall();
      }
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
        Enter a number and start. Opens the dialer popup, joins the AI into the conference before
        the customer is dialed, then calls them. The AI speaks only after they answer. You stay muted
        to listen.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
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
            disabled={busy || inLiveCall}
          />
        </div>
        {!inLiveCall ? (
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

      {inLiveCall ? (
        <p className="mt-3 text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Live call #{session.callId}
          {activeSalesCall ? " · Sales Bot connected" : ""}
        </p>
      ) : null}
      {info ? <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{info}</p> : null}
      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
