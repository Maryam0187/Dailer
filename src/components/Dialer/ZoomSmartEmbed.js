"use client";

import { useZoomSmartEmbed } from "@/contexts/ZoomSmartEmbedContext";

/**
 * Zoom Phone Smart Embed mount marker + setup hint.
 * The Zoom SDK script injects the floating softphone; audio requires the
 * Zoom desktop client signed in and running.
 */
export default function ZoomSmartEmbed() {
  const { enabled, ready } = useZoomSmartEmbed();

  if (!enabled) return null;

  return (
    <div
      id="zoom-smart-embed-host"
      className="fixed bottom-4 left-4 z-[55] max-w-xs rounded-xl border border-blue-200 bg-blue-50/95 px-3 py-2 text-xs text-blue-950 shadow-lg backdrop-blur dark:border-blue-800 dark:bg-blue-950/90 dark:text-blue-100"
      data-zoom-ready={ready ? "1" : "0"}
    >
      <p className="font-semibold">Zoom Phone</p>
      <p className="mt-0.5 leading-snug opacity-90">
        {ready
          ? "Keep the Zoom desktop app open and signed in. If Zoom asks to log in, sign in there, then refresh this page."
          : "Loading Zoom softphone…"}
      </p>
    </div>
  );
}
