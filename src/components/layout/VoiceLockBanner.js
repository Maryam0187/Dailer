"use client";

import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

/**
 * Shows when Twilio unregistered this tab's Device because a newer tab in the
 * same browser registered with the same identity. New incoming calls now route
 * to that other tab. Any in-progress call here keeps working — that gets a
 * softer "voice handed off" notice.
 *
 * Cross-browser / cross-device "logged in elsewhere" is handled separately by
 * the auth layer: a newer sign-in rotates the user's sid, and the kicked tab's
 * next API call hits 401 and is bounced to /sign-in?reason=replaced.
 */
export default function VoiceLockBanner() {
  const { voiceDisplaced, ensureRegistered } = useTwilioVoice();
  const { session } = useActiveCall();

  if (!voiceDisplaced) return null;

  if (session) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-sky-300 bg-sky-50/95 px-4 py-2 text-sm font-medium text-sky-900 backdrop-blur dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-100"
      >
        <span aria-hidden>ℹ️</span>
        <span>
          Your current call continues here. New incoming calls now route to the other
          tab — this one was superseded.
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-amber-300 bg-amber-100/95 px-4 py-2 text-sm font-medium text-amber-900 backdrop-blur dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-100"
    >
      <span aria-hidden>⚠️</span>
      <span>Another tab in this browser is the active dialer.</span>
      <button
        type="button"
        onClick={() => ensureRegistered().catch(() => {})}
        className="rounded-md border border-amber-500/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-sm hover:bg-white dark:border-amber-400/40 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/70"
      >
        Use this tab
      </button>
    </div>
  );
}
