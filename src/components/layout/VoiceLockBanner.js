"use client";

import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

/**
 * Surfaces the "this tab is not the active dialer" states in priority order:
 *
 * 1. **Secondary tab (localStorage lock held by sibling)** — the primary case.
 *    No Twilio Device is registered here; show a clear notice with a one-click
 *    "Use this tab" button that grabs the lock.
 *
 * 2. **Displaced (Twilio-driven, rare)** — Twilio unregistered our Device
 *    because a Device with the same identity registered elsewhere (cross-device
 *    edge case; same-browser is now prevented by the lock). Mid-call gets a
 *    softer info notice; idle gets a takeover button.
 */
export default function VoiceLockBanner() {
  const { isPrimaryTab, voiceDisplaced, takeOverDialer } = useTwilioVoice();
  const { session } = useActiveCall();

  if (isPrimaryTab === false) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-amber-300 bg-amber-100/95 px-4 py-2 text-sm font-medium text-amber-900 backdrop-blur dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-100"
      >
        <span aria-hidden>⚠️</span>
        <span>Dialer is already active in another tab.</span>
        <button
          type="button"
          onClick={() => takeOverDialer?.()}
          className="rounded-md border border-amber-500/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-sm hover:bg-white dark:border-amber-400/40 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/70"
        >
          Use this tab
        </button>
      </div>
    );
  }

  if (voiceDisplaced && session) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-sky-300 bg-sky-50/95 px-4 py-2 text-sm font-medium text-sky-900 backdrop-blur dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-100"
      >
        <span aria-hidden>ℹ️</span>
        <span>
          Your current call continues here. New incoming calls now route elsewhere —
          this Device was superseded.
        </span>
      </div>
    );
  }

  return null;
}
