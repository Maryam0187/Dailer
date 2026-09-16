"use client";

import { useEffect, useState } from "react";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

export default function AddressBotCallControls({ session, patchSession }) {
  const { voiceConnected, muted: sdkMuted, setCallMuted } = useTwilioVoice();
  const [addresses, setAddresses] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [activeAddressId, setActiveAddressId] = useState(null);
  const [activeLabel, setActiveLabel] = useState("");
  const [startingId, setStartingId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [botReady, setBotReady] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [mutedForBot, setMutedForBot] = useState(false);
  const [open, setOpen] = useState(false);

  const callId = Number(session?.callId);
  const callReady = Number.isInteger(callId) && callId > 0 && session?.phase === "in_progress";
  const botRunning = Number.isInteger(activeAddressId) && activeAddressId > 0;
  const starting = Number.isInteger(startingId) && startingId > 0;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/company-addresses", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load addresses");
        if (!cancelled) {
          setAddresses(Array.isArray(json.addresses) ? json.addresses : []);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Failed to load addresses");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [callId, open]);

  useEffect(() => {
    setActiveAddressId(null);
    setActiveLabel("");
    setActionError(null);
    setMutedForBot(false);
    setBotReady(false);
    setConnecting(false);
  }, [callId]);

  async function connectBot() {
    if (!callReady || connecting || botReady || botRunning) return;
    setConnecting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/calls/address-bot/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to connect address bot");

      if (json.conferenceName && patchSession) {
        patchSession({
          conferenceName: json.conferenceName,
          callMode: json.callMode || "conference",
        });
      }
      setBotReady(true);
    } catch (e) {
      setBotReady(false);
      setActionError(e.message || "Failed to connect address bot");
    } finally {
      setConnecting(false);
    }
  }

  async function startBot(row) {
    if (!callReady || starting || botRunning || !botReady || connecting) return;
    setStartingId(row.id);
    setActionError(null);
    try {
      const res = await fetch("/api/calls/address-bot/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          addressId: row.id,
          conferenceName: session?.conferenceName || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start address bot");

      if (json.conferenceName && patchSession) {
        patchSession({
          conferenceName: json.conferenceName,
          callMode: json.callMode || "conference",
        });
      }

      const wasMuted = Boolean(sdkMuted);
      if (voiceConnected && setCallMuted && !wasMuted) {
        setCallMuted(true);
        setMutedForBot(true);
      } else {
        setMutedForBot(false);
      }

      setActiveAddressId(row.id);
      setActiveLabel(row.label || "Address");
    } catch (e) {
      setActionError(e.message || "Failed to start address bot");
    } finally {
      setStartingId(null);
    }
  }

  async function interruptBot() {
    if (!callReady || stopping || (!botRunning && !botReady)) return;
    setStopping(true);
    setActionError(null);
    try {
      const res = await fetch("/api/calls/address-bot/stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          conferenceName: session?.conferenceName || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to stop address bot");

      if (mutedForBot && voiceConnected && setCallMuted) {
        setCallMuted(false);
      }
      setMutedForBot(false);
      setActiveAddressId(null);
      setActiveLabel("");
      setBotReady(false);
    } catch (e) {
      setActionError(e.message || "Failed to stop address bot");
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          Address bot
        </p>
        <svg
          className={`h-4 w-4 shrink-0 text-indigo-700 transition-transform dark:text-indigo-300 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!open && botRunning ? (
        <p className="mt-2 text-xs font-medium text-indigo-800 dark:text-indigo-200">
          Speaking: {activeLabel}…
        </p>
      ) : null}
      {!open && !botRunning && botReady ? (
        <p className="mt-2 text-xs font-medium text-indigo-800 dark:text-indigo-200">
          Bot ready (silent)
        </p>
      ) : null}
      {open ? (
        <>
          {loadError ? (
            <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{loadError}</p>
          ) : null}
          {!loadError && addresses.length === 0 ? (
            <p className="mt-2 text-xs text-indigo-800/80 dark:text-indigo-200/80">
              No addresses yet. An admin can add them on Address bot settings.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connectBot}
                disabled={!callReady || connecting || botReady || botRunning || stopping}
                className="h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-800 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-700 dark:bg-zinc-900 dark:text-indigo-200 dark:hover:bg-zinc-800"
              >
                {connecting ? "Connecting…" : botReady || botRunning ? "Bot ready" : "Ready bot"}
              </button>
              {addresses.map((row) => {
                const selected = botRunning && Number(activeAddressId) === Number(row.id);
                const disabled =
                  !callReady ||
                  !botReady ||
                  connecting ||
                  starting ||
                  stopping ||
                  (botRunning && !selected);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => startBot(row)}
                    disabled={disabled || selected}
                    className={`h-9 rounded-lg px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? "bg-indigo-800 text-white dark:bg-indigo-500"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                    }`}
                  >
                    {startingId === row.id ? "Starting…" : `Start ${row.label}`}
                  </button>
                );
              })}
            </div>
          )}

          {botReady && !botRunning ? (
            <p className="mt-2 text-xs font-medium text-indigo-800 dark:text-indigo-200">
              Address bot is on the call and silent. Click Start when you want it to speak.
            </p>
          ) : null}

          {botRunning ? (
            <p className="mt-2 text-xs font-medium text-indigo-800 dark:text-indigo-200">
              Address bot speaking: {activeLabel}…
            </p>
          ) : null}

          <button
            type="button"
            onClick={interruptBot}
            disabled={(!botRunning && !botReady) || stopping}
            className="mt-2 h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-800 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-700 dark:bg-zinc-900 dark:text-indigo-200 dark:hover:bg-zinc-800"
          >
            {stopping ? "Stopping…" : "Interrupt"}
          </button>

          {actionError ? (
            <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{actionError}</p>
          ) : (
            <p className="mt-2 text-xs text-indigo-700/80 dark:text-indigo-300/80">
              Click Ready bot first. It joins muted and stays quiet. Then Start an address.
              Interrupt drops the bot so you can talk.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
