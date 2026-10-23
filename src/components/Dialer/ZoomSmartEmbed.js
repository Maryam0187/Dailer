"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useZoomSmartEmbed } from "@/contexts/ZoomSmartEmbedContext";
import { buildZoomPhoneIframeUrl, ZOOM_PHONE_IFRAME_ID } from "@/lib/zoomSmartEmbed";

/**
 * Zoom Phone Soft Embed in our bottom-right panel (Twilio-style).
 * We host the iframe ourselves so minimize collapses to the bottom bar,
 * not Zoom's default side dock.
 * Panel is shown on the Dialer home page; stays visible during an active Zoom call
 * if the user navigates away. Iframe stays mounted off-page so Soft Embed stays connected.
 */
export default function ZoomSmartEmbed() {
  const pathname = usePathname();
  const { enabled, ready, lastEvent, onIframeLoad } = useZoomSmartEmbed();
  const [isMinimized, setIsMinimized] = useState(false);
  // Set src after mount — SSR/useMemo([]) cached "" and left the iframe blank on refresh.
  const [iframeSrc, setIframeSrc] = useState("");

  useEffect(() => {
    setIframeSrc(buildZoomPhoneIframeUrl(window.location.origin));
  }, []);

  if (!enabled) return null;

  const eventType = lastEvent?.type || "";
  const inCall =
    eventType === "zp-call-ringing-event" ||
    eventType === "zp-call-connected-event";

  const onDialerPage = pathname === "/";
  const showPanel = onDialerPage || inCall;
  const collapseBody = isMinimized || !showPanel;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9998] transition-all duration-300 ${
        showPanel ? (isMinimized ? "w-72" : "w-[350px]") : "pointer-events-none h-0 w-0 overflow-hidden opacity-0"
      }`}
      aria-hidden={!showPanel}
    >
      <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-2xl shadow-blue-500/15 dark:border-blue-800 dark:bg-zinc-900 dark:shadow-blue-950/30">
        {showPanel ? (
          <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 p-3 text-white">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  inCall
                    ? "animate-pulse bg-emerald-300"
                    : ready
                      ? "bg-emerald-300"
                      : "animate-pulse bg-amber-200"
                }`}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">Zoom Phone</div>
                <div className="truncate text-xs text-blue-100">
                  {inCall ? "In call" : ready ? "Ready" : "Loading…"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsMinimized((v) => !v)}
              className="ml-2 rounded p-1 transition-colors hover:bg-blue-700"
              aria-label={isMinimized ? "Expand Zoom Phone" : "Minimize Zoom Phone"}
            >
              {isMinimized ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
        ) : null}

        {/* Keep iframe mounted when hidden/minimized so Soft Embed stays connected.
            Soft Embed content is taller than Zoom's 580px minimum — use 700px to avoid inner scroll. */}
        <div
          className={
            collapseBody
              ? "h-0 overflow-hidden opacity-0"
              : "overflow-hidden opacity-100"
          }
          aria-hidden={collapseBody}
        >
          {iframeSrc ? (
            <iframe
              id={ZOOM_PHONE_IFRAME_ID}
              title="Zoom Phone"
              src={iframeSrc}
              allow="clipboard-read; clipboard-write https://applications.zoom.us; microphone; autoplay"
              onLoad={() => onIframeLoad?.()}
              scrolling="no"
              className="block h-[700px] w-full border-0 bg-white dark:bg-zinc-950"
              style={{ overflow: "hidden" }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
