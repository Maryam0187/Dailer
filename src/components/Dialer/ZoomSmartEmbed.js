"use client";

import { useZoomSmartEmbed } from "@/contexts/ZoomSmartEmbedContext";

/**
 * Zoom Phone Smart Embed mount marker.
 * The Zoom SDK script injects the floating softphone; setup copy lives on the Dialer Zoom tab.
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
