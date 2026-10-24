"use client";

import { useState } from "react";
import { useZoomSmartEmbed } from "@/contexts/ZoomSmartEmbedContext";
import { digitsOnly } from "@/lib/phoneFormat";

export default function ZoomCallButton({
  phone,
  className = "",
  label = "Zoom",
  disabled = false,
}) {
  const { enabled, ready, makeCall } = useZoomSmartEmbed();
  const [status, setStatus] = useState(null);

  if (!enabled) return null;

  const number = digitsOnly(phone) || String(phone || "").trim();
  // Softphone UI can work before our ready flag catches up — still allow dial attempts.
  const canDial = Boolean(number) && !disabled;

  async function onClick() {
    setStatus(null);
    if (!number) {
      setStatus("Enter a phone number");
      return;
    }
    const ok = await makeCall(number, { autoDial: true });
    if (ok) {
      setStatus("Dialing via Zoom…");
    } else if (!ready) {
      setStatus("Zoom Phone is loading… try again in a moment");
    } else {
      setStatus("Zoom call blocked — check Zoom Phone access or sign in to Zoom");
    }
    window.setTimeout(() => setStatus(null), 2000);
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={!canDial}
        title={ready ? "Call with Zoom Phone" : "Zoom Phone loading…"}
        aria-label="Call with Zoom Phone"
        className={`inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:bg-none disabled:text-zinc-500 disabled:shadow-none dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300 ${className}`}
      >
        {label}
      </button>
      {status ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{status}</span>
      ) : null}
    </span>
  );
}
