"use client";

import { useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTransferInput(raw) {
  return String(raw || "").replace(/[^\d+()\- ]/g, "");
}

function ActiveCallPanel({ session, endCall }) {
  const { voiceConnected, muted: sdkMuted, toggleMute, sdkError } = useTwilioVoice();
  const [isMinimized, setIsMinimized] = useState(false);
  const [uiMuted, setUiMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [transferTo, setTransferTo] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [transferStatus, setTransferStatus] = useState(null);
  const isMuted = voiceConnected ? sdkMuted : uiMuted;

  useEffect(() => {
    if (session.phase !== "in_progress") return undefined;
    const start = session.startedAt;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.phase, session.startedAt]);

  const displayCallStatus = session.phase === "connecting" ? "queued" : "in-progress";
  const elapsed = session.phase === "in_progress" ? elapsedSec : 0;

  const title = session.customerName?.trim() || "Active call";
  const subtitle = session.phoneLabel || session.toNumber;

  async function startWarmTransfer() {
    if (!session?.conferenceName || !session?.callId) {
      setTransferError("Warm transfer is unavailable: missing conference session.");
      return;
    }
    if (!transferTo.trim()) {
      setTransferError("Enter a transfer phone number.");
      return;
    }

    setTransferLoading(true);
    setTransferError(null);
    setTransferStatus(null);
    try {
      const res = await fetch("/api/calls/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          callId: session.callId,
          conferenceName: session.conferenceName,
          toNumber: transferTo.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Warm transfer failed");
      setTransferStatus(`Dialing transfer target ${json?.transfer?.toNumber || transferTo.trim()}...`);
      setTransferTo("");
    } catch (e) {
      setTransferError(e?.message || "Warm transfer failed");
    } finally {
      setTransferLoading(false);
    }
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
        isMinimized ? "w-72" : "w-[26rem] max-h-[calc(100vh-2rem)]"
      }`}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border-2 border-sky-200 bg-white shadow-2xl shadow-sky-500/10 backdrop-blur-sm dark:border-sky-800 dark:bg-zinc-900 dark:shadow-sky-950/20">
        <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 p-3 text-white">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex-shrink-0">
              {displayCallStatus === "in-progress" ? (
                <div className="h-3 w-3 animate-pulse rounded-full bg-green-400" />
              ) : (
                <div className="h-3 w-3 animate-pulse rounded-full bg-gray-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{title}</div>
              <div className="flex flex-wrap items-center gap-2">
                {subtitle ? (
                  <div className="truncate text-xs text-blue-100">{subtitle}</div>
                ) : null}
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    displayCallStatus === "in-progress"
                      ? "bg-green-500/30 text-green-100"
                      : "bg-gray-500/30 text-gray-100"
                  }`}
                >
                  {displayCallStatus === "in-progress" ? "In progress" : "Queued"}
                </div>
                {displayCallStatus === "in-progress" ? <div className="text-xs font-bold text-white">{formatTimer(elapsed)}</div> : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="ml-2 rounded p-1 transition-colors hover:bg-blue-700"
            aria-label={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>

        {!isMinimized && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {session.phase === "connecting" && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400" />
                <div>
                  <div className="font-semibold text-blue-700 dark:text-blue-300">Connecting…</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Call logged — stay on this screen</div>
                </div>
              </div>
            )}

            {session.phase === "in_progress" && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
                <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
                <div className="text-sm font-semibold text-green-700 dark:text-green-300">
                  Call connected
                </div>
              </div>
            )}

            {sdkError ? (
              <p
                className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                role="status"
              >
                Voice SDK: {sdkError}
              </p>
            ) : null}

            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-900/50 dark:bg-violet-950/30">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    Warm Transfer
                  </p>
                  {transferLoading ? (
                    <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                      Dialing...
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="Transfer number"
                    value={transferTo}
                    onChange={(e) => setTransferTo(formatTransferInput(e.target.value))}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-[border-color,box-shadow] focus:border-violet-500 focus:ring-2 focus:ring-violet-300/50 dark:border-violet-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-violet-500 dark:focus:ring-violet-500/30"
                    disabled={transferLoading}
                  />
                  <button
                    type="button"
                    onClick={startWarmTransfer}
                    disabled={transferLoading || !transferTo.trim()}
                    className="h-9 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
                  >
                    Add
                  </button>
                </div>
                {transferError ? (
                  <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{transferError}</p>
                ) : null}
                {transferStatus ? (
                  <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">{transferStatus}</p>
                ) : (
                  <p className="mt-2 text-xs text-violet-700/80 dark:text-violet-300/80">
                    Add another participant, then hang up after they join.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  if (voiceConnected) toggleMute();
                  else setUiMuted((m) => !m);
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isMuted
                    ? "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={endCall}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-medium text-white shadow-lg transition-colors hover:bg-red-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
                  />
                </svg>
                Hang up
              </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GlobalWebCallInterface() {
  const { session, endCall } = useActiveCall();
  if (!session) return null;
  return <ActiveCallPanel key={session.callId} session={session} endCall={endCall} />;
}
