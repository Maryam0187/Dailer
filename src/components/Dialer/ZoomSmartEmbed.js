"use client";

import { useZoomSmartEmbed } from "@/contexts/ZoomSmartEmbedContext";

/**
 * Zoom Phone Smart Embed mount marker.
 * The Zoom SDK script (loaded by ZoomSmartEmbedProvider) injects the floating
 * softphone iframe (`#zoom-embeddable-phone-iframe`) and handles drag/minimize.
 */
export default function ZoomSmartEmbed() {
  const { enabled, ready } = useZoomSmartEmbed();

  if (!enabled) return null;

  return (
    <div
      id="zoom-smart-embed-host"
      className="sr-only"
      aria-live="polite"
      data-zoom-ready={ready ? "1" : "0"}
    >
      {ready ? "Zoom Phone ready" : "Zoom Phone loading"}
    </div>
  );
}
