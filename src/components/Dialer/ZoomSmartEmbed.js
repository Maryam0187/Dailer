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
  const [isMinimized, setIsMinimized] = useState(true);
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
  // Minimized by default; auto-expand while Soft Embed has an active/ringing call.
  const collapsed = (isMinimized && !inCall) || !showPanel;

  return (
    <div
      className={`fixed bottom-3 right-3 z-[9998] transition-all duration-300 ${
        showPanel
          ? collapsed
            ? "w-64"
            : "w-[350px] max-h-[calc(100dvh-1.5rem)]"
          : "pointer-events-none h-0 w-0 overflow-hidden opacity-0"
      }`}
      aria-hidden={!showPanel}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl border border-blue-300 bg-white shadow-xl shadow-blue-500/10 dark:border-blue-800 dark:bg-zinc-900 dark:shadow-blue-950/30">
        {showPanel ? (
          <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-2.5 py-1.5 text-white">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  inCall
                    ? "animate-pulse bg-emerald-300"
                    : ready
                      ? "bg-emerald-300"
                      : "animate-pulse bg-amber-200"
                }`}
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold leading-tight">Zoom Phone</div>
                <div className="truncate text-[10px] leading-tight text-blue-100">
                  {inCall ? "In call" : ready ? "Ready" : "Loading…"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsMinimized((v) => !v)}
              className="ml-1 rounded p-0.5 transition-colors hover:bg-blue-700"
              aria-label={collapsed ? "Expand Zoom Phone" : "Minimize Zoom Phone"}
            >
              {collapsed ? (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
        ) : null}

        {/* Keep iframe mounted when hidden/minimized so Soft Embed stays connected.
            Clip Soft Embed to panel — Zoom min size is 350×580; cap to viewport. */}
        <div
          className={
            collapsed
              ? "h-0 overflow-hidden opacity-0"
              : "min-h-0 flex-1 overflow-hidden opacity-100"
          }
          aria-hidden={collapsed}
        >
          {iframeSrc ? (
            <iframe
              id={ZOOM_PHONE_IFRAME_ID}
              title="Zoom Phone"
              src={iframeSrc}
              allow="clipboard-read; clipboard-write https://applications.zoom.us; microphone; autoplay"
              onLoad={() => onIframeLoad?.()}
              scrolling="no"
              className="block w-full max-h-[calc(100dvh-4.5rem)] border-0 bg-white dark:bg-zinc-950"
              style={{ height: "min(580px, calc(100dvh - 4.5rem))", overflow: "hidden" }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
