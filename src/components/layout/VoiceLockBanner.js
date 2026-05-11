"use client";

import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

/**
 * Shown when this tab/device cannot acquire the Dialer session lock (another tab or
 * device owns it). Tells the user that calling is disabled here until the other
 * session ends — registration is retried automatically in the background.
 */
export default function VoiceLockBanner() {
  const { voiceLocked } = useTwilioVoice();
  if (!voiceLocked) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100/95 px-4 py-2 text-sm font-medium text-amber-900 backdrop-blur dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-100"
    >
      <span aria-hidden>⚠️</span>
      <span>
        Dialer is active in another tab or device. Calling is disabled here — this tab will
        re-enable automatically once the other session ends.
      </span>
    </div>
  );
}
