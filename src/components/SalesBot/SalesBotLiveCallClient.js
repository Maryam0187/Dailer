"use client";

import { useEffect, useRef, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { digitsOnly, formatLandline } from "@/lib/phoneFormat";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const [botStatus, setBotStatus] = useState(""); // "", "waiting", "live", "failed"
  /** Only the call started from this Sales Bot button — never hijack a normal dialer call. */
  const [salesBotCallId, setSalesBotCallId] = useState(null);
  const salesBotCallIdRef = useRef(null);
  const attachGenRef = useRef(0);

  const inSalesBotCall =
    Number.isInteger(Number(salesBotCallId)) &&
    Number(salesBotCallId) > 0 &&
    Number(session?.callId) === Number(salesBotCallId) &&
    Boolean(session?.callOwnedByMe);

  const salesBotLive = Boolean(inSalesBotCall && session?.salesBotAttached);

  function abortAttachLoop() {
    attachGenRef.current += 1;
  }

  function clearSalesBotCallTracking() {
    abortAttachLoop();
    salesBotCallIdRef.current = null;
    setSalesBotCallId(null);
    setBotStatus("");
  }

  // If the dialer session ends or switches to another call, stop attaching.
  useEffect(() => {
    const tracked = Number(salesBotCallIdRef.current);
    if (!Number.isInteger(tracked) || tracked <= 0) return;
    const activeId = Number(session?.callId);
    if (!Number.isInteger(activeId) || activeId <= 0 || activeId !== tracked) {
      clearSalesBotCallTracking();
    }
  }, [session?.callId]);

  useEffect(() => {
    return () => {
      abortAttachLoop();
    };
  }, []);

  // Mute only for this Sales Bot call after AI attaches — never mute unrelated dialer calls.
  useEffect(() => {
    if (!salesBotLive || !voiceConnected || !setCallMuted) return;
    setCallMuted(true);
  }, [salesBotLive, voiceConnected, setCallMuted]);

  /**
   * Same as Quick Dial: agent softphone + dialer popup + bridge to customer.
   * After the customer answers, upgrade to conference, join AI, then speak.
   * Safe: aborted if call ends / changes; only runs for salesBotCallId.
   */
  async function attachSalesBotWhenCustomerAnswers(callId, generation) {
    setBotStatus("waiting");
    for (let i = 0; i < 60; i++) {
      if (attachGenRef.current !== generation) return;
      if (Number(salesBotCallIdRef.current) !== Number(callId)) return;

      const res = await fetch("/api/sales-bot/calls/attach", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, intent: "sales_bot" }),
      });
      if (attachGenRef.current !== generation) return;

      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        if (patchSession) {
          patchSession((current) => {
            // Never patch a different / normal dialer session.
            if (!current || Number(current.callId) !== Number(callId)) return current;
            return {
              ...current,
              conferenceName: json.conferenceName,
              callMode: json.callMode || "conference",
              dialMode: "sales_bot",
              salesBotAttached: true,
              salesBotIntent: true,
            };
          });
        }
        if (setCallMuted) setCallMuted(true);
        setBotStatus("live");
        setInfo("Customer answered — AI speaking greeting. You are muted; unmute to jump in.");
        return;
      }

      if (res.status === 409 || json?.retryable) {
        const phase = String(json?.phase || "");
        setBotStatus("waiting");
        if (phase === "ringing") {
          setInfo("Ringing… AI waits until the customer answers.");
        } else if (phase === "connecting") {
          setInfo("Customer answered — connecting AI…");
        } else {
          setInfo(json?.error || "Waiting for customer answer…");
        }
        await sleep(1500);
        continue;
      }

      setBotStatus("failed");
      setError(json?.error || "Failed to attach AI bot");
      return;
    }
    if (attachGenRef.current !== generation) return;
    setBotStatus("failed");
    setError("Timed out waiting for the customer so the AI could join.");
  }

  async function startCall() {
    setError(null);
    setInfo(null);
    setBotStatus("");
    setBusy(true);
    try {
      // Do not interrupt a normal dialer / Address Bot call.
      if (session?.callId) {
        throw new Error("End your current dialer call before starting Sales Bot.");
      }

      const raw = String(toNumber || "").trim();
      const toDigits = digitsOnly(raw);
      if (toDigits.length < 7) {
        throw new Error("Enter a valid phone number");
      }

      // Exact current dialer flow (Quick Dial) — unchanged /api/calls/start.
      expectOutgoingIncomingLeg(45000);
      if (!registered || sdkInitializing) {
        const ok = await ensureRegistered();
        if (!ok) throw new Error("Dialer is not ready. Open the Dialer page and try again.");
      }

      // Tag sales_bot at create so bridge enables AMD before customer dial.
      const result = await startOutgoingCall({
        toNumber: toDigits,
        intent: "sales_bot",
        dialMode: "sales_bot",
      });
      if (!result.ok) throw new Error(result.error || "Dial failed");

      const callId = result.call.id;
      salesBotCallIdRef.current = callId;
      setSalesBotCallId(callId);

      // Keep mark as a safety net if start ignored intent.
      await fetch("/api/sales-bot/calls/mark", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, intent: "sales_bot" }),
      }).catch(() => {});

      beginSession({
        callId,
        callOwnedByMe: true,
        callMode: result.callMode || "direct",
        dialMode: "sales_bot",
        toNumber: result.call.toNumber,
        phoneLabel: raw || formatLandline(toDigits),
        customerName: "Sales Bot call",
        conferenceName: result.conferenceName || undefined,
        salesBotAttached: false,
        salesBotIntent: true,
      });

      setInfo("Dialer opened — agent connecting and calling the customer (same as Quick Dial).");

      const generation = ++attachGenRef.current;
      void attachSalesBotWhenCustomerAnswers(callId, generation).catch((err) => {
        if (attachGenRef.current !== generation) return;
        setBotStatus("failed");
        setError(err?.message || "Failed to attach AI bot");
      });
    } catch (err) {
      setError(err?.message || "Failed to start");
      clearSalesBotCallTracking();
    } finally {
      setBusy(false);
    }
  }

  async function stopCall() {
    setBusy(true);
    setError(null);
    const callId = Number(salesBotCallIdRef.current || session?.callId);
    const wasAttached = Boolean(session?.salesBotAttached);
    const conferenceName = session?.conferenceName || "";
    clearSalesBotCallTracking();
    try {
      // Only tear down via sales-bot stop when AI actually attached (conference).
      if (Number.isInteger(callId) && callId > 0 && wasAttached) {
        await fetch("/api/sales-bot/calls/stop", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId,
            conferenceName,
            intent: "sales_bot",
          }),
        }).catch(() => {});
      }
      // Always end via the normal dialer end path so hangup matches Quick Dial.
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
        Same as Quick Dial: start → dialer popup → agent connects → customer rings. AI joins and
        speaks after the customer answers (not while ringing). Normal dialer calls are never modified.
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
            disabled={busy || inSalesBotCall}
          />
        </div>
        {!inSalesBotCall ? (
          <button
            type="button"
            onClick={() => void startCall()}
            disabled={busy || !toNumber.trim() || Boolean(session?.callId)}
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

      {session?.callId && !inSalesBotCall ? (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
          A dialer call is already active. End it in the dialer popup before starting Sales Bot.
        </p>
      ) : null}

      {inSalesBotCall ? (
        <p className="mt-3 text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Live call #{session.callId}
          {botStatus === "waiting" ? " · waiting for customer, then AI joins…" : null}
          {botStatus === "live" || salesBotLive ? " · AI bot live" : null}
          {botStatus === "failed" ? " · AI bot failed to join" : null}
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
