"use client";

import { useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useLine2Call } from "@/contexts/Line2CallContext";
import { useTwilioVoiceLine2 } from "@/contexts/TwilioVoiceLine2Context";

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function hasResolvedNumericCallId(sess) {
  if (!sess) return false;
  const n = Number(sess.callId);
  return Number.isInteger(n) && n > 0;
}

function Line2ActiveCallPanel({ session, hangup }) {
  const { voiceConnected, muted: sdkMuted, toggleMute, sendDtmf, sdkError } = useTwilioVoiceLine2();
  const [isMinimized, setIsMinimized] = useState(false);
  const [uiMuted, setUiMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmfInput, setDtmfInput] = useState("");
  const [dtmfStatus, setDtmfStatus] = useState(null);
  const isMuted = voiceConnected ? sdkMuted : uiMuted;
  const { session: line1Session } = useActiveCall();
  const line1Open = hasResolvedNumericCallId(line1Session);

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
  const title = session.customerName?.trim() || "Customer";
  const subtitle = session.phoneLabel || session.toNumber;

  function onDtmfKey(key) {
    if (!voiceConnected) return;
    const ok = sendDtmf(key);
    setDtmfStatus(ok ? `Sent tone: ${key}` : "Unable to send tone.");
    if (ok) window.setTimeout(() => setDtmfStatus(null), 1200);
  }

  function submitDtmfInput() {
    const clean = dtmfInput.replace(/[^0-9*#wW]/g, "");
    if (!clean) {
      setDtmfStatus("Enter digits to send.");
      return;
    }
    const ok = sendDtmf(clean);
    setDtmfStatus(ok ? `Sent: ${clean}` : "Unable to send digits.");
    if (ok) setDtmfInput("");
  }

  return (
    <div
      className={`fixed bottom-4 z-[9998] transition-all duration-300 ${
        line1Open ? "right-[29rem]" : "right-4"
      } ${isMinimized ? "w-72" : "w-[26rem] max-h-[calc(100vh-2rem)]"}`}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border-2 border-violet-200 bg-white shadow-2xl shadow-violet-500/10 backdrop-blur-sm dark:border-violet-800 dark:bg-zinc-900 dark:shadow-violet-950/20">
        <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 p-3 text-white">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex-shrink-0">
              {displayCallStatus === "in-progress" ? (
                <div className="h-3 w-3 animate-pulse rounded-full bg-green-400" />
              ) : (
                <div className="h-3 w-3 animate-pulse rounded-full bg-gray-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">Line 2 · {title}</div>
              <div className="flex flex-wrap items-center gap-2">
                {subtitle ? <div className="truncate text-xs text-violet-100">{subtitle}</div> : null}
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    displayCallStatus === "in-progress"
                      ? "bg-green-500/30 text-green-100"
                      : "bg-gray-500/30 text-gray-100"
                  }`}
                >
                  {displayCallStatus === "in-progress" ? "In progress" : "Queued"}
                </div>
                {displayCallStatus === "in-progress" ? (
                  <div className="text-xs font-bold text-white">{formatTimer(elapsed)}</div>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="ml-2 rounded p-1 transition-colors hover:bg-violet-700"
            aria-label={isMinimized ? "Expand Line 2" : "Minimize Line 2"}
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

        {!isMinimized ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {session.phase === "connecting" ? (
              <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/40">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent dark:border-violet-400" />
                <div>
                  <div className="font-semibold text-violet-700 dark:text-violet-300">Connecting…</div>
                  <div className="text-xs text-violet-600 dark:text-violet-400">Line 2 — stay on this screen</div>
                </div>
              </div>
            ) : null}

            {sdkError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {sdkError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => setShowKeypad((v) => !v)}
              disabled={!voiceConnected}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
            >
              {showKeypad ? "Hide Keypad" : "Show Keypad"}
            </button>

            {showKeypad ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
                <div className="grid grid-cols-3 gap-2">
                  {DTMF_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onDtmfKey(key)}
                      disabled={!voiceConnected}
                      className="h-10 rounded-lg border border-violet-200 bg-white text-sm font-semibold text-violet-900 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-100 dark:hover:bg-violet-900/40"
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={dtmfInput}
                    onChange={(e) => setDtmfInput(e.target.value.replace(/[^0-9*#wW]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitDtmfInput();
                      }
                    }}
                    placeholder="Enter digits then press Enter"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-300/50 dark:border-violet-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={submitDtmfInput}
                    disabled={!voiceConnected || !dtmfInput.trim()}
                    className="h-9 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  >
                    Send
                  </button>
                </div>
                {dtmfStatus ? (
                  <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">{dtmfStatus}</p>
                ) : null}
              </div>
            ) : null}

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
              onClick={() => void hangup()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-red-700"
            >
              End Line 2
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Line2CallInterface() {
  const { session } = useLine2Call();
  const { hangup, enabled } = useTwilioVoiceLine2();
  if (!enabled) return null;
  if (!session || !hasResolvedNumericCallId(session)) return null;
  return <Line2ActiveCallPanel key={session.callId || "line2-call"} session={session} hangup={hangup} />;
}
