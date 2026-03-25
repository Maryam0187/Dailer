"use client";

import { useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ActiveCallPanel({ session, endCall }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

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

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
        isMinimized ? "w-64" : "w-80 max-h-[calc(100vh-2rem)]"
      }`}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-lg border-2 border-blue-200 bg-white shadow-2xl backdrop-blur-sm dark:border-blue-800 dark:bg-zinc-900">
        <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-blue-500 to-blue-600 p-3 text-white">
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
                {displayCallStatus === "in-progress" ? (
                  <div className="text-xs font-bold text-white">{formatTimer(elapsed)}</div>
                ) : null}
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

            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
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
