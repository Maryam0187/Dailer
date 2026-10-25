"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  getZoomIframe,
  initZoomSmartEmbed,
  isZoomIframeReadyForPostMessage,
  subscribeZoomSmartEmbedEvents,
  zoomInputSms,
  zoomMakeCall,
  ZOOM_PHONE_ORIGIN,
} from "@/lib/zoomSmartEmbed";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import { useDialerCapabilities } from "@/contexts/DialerCapabilitiesContext";

const ZoomSmartEmbedContext = createContext({
  enabled: false,
  ready: false,
  lastEvent: null,
  makeCall: async () => false,
  inputSms: () => false,
  onIframeLoad: () => {},
});

export function ZoomSmartEmbedProvider({ children }) {
  const { canUseZoomPhone } = useDialerCapabilities();
  const enabled = ZOOM_SMART_EMBED_ENABLED && Boolean(canUseZoomPhone);
  const [ready, setReady] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const readyRef = useRef(false);
  const initSentRef = useRef(false);

  const markReady = useCallback(() => {
    // Only zp-init-config when iframe is on applications.zoom.us (not CRM/about:blank).
    if (!initSentRef.current && isZoomIframeReadyForPostMessage(getZoomIframe())) {
      if (initZoomSmartEmbed()) initSentRef.current = true;
    }
    if (!readyRef.current && (initSentRef.current || getZoomIframe()?.contentWindow)) {
      readyRef.current = true;
      setReady(true);
    }
  }, []);

  const onIframeLoad = useCallback(() => {
    // Soft Embed (re)loaded — allow zp-init-config again (refresh / remount).
    initSentRef.current = false;
    readyRef.current = false;
    setReady(false);
    window.setTimeout(() => markReady(), 300);
  }, [markReady]);

  useEffect(() => {
    if (!enabled) {
      readyRef.current = false;
      initSentRef.current = false;
      setReady(false);
      return undefined;
    }

    // Built panel hosts the iframe — strip Zoom SDK side-dock (avoid two UIs).
    document.querySelectorAll('script[data-zoom-smart-embed="1"]').forEach((el) => {
      try {
        el.remove();
      } catch {
        /* ignore */
      }
    });

    function onMessage(event) {
      if (event.origin !== ZOOM_PHONE_ORIGIN) return;
      const type = event.data?.type;
      if (
        type === "zp-ready" ||
        type === "zp-call-ringing-event" ||
        type === "zp-call-connected-event" ||
        type === "zp-call-ended-event" ||
        type === "zp-call-log-completed-event"
      ) {
        markReady();
      }
    }
    window.addEventListener("message", onMessage);

    // Retry until Soft Embed is cross-origin — never init on same-origin contentWindow alone.
    let attempts = 0;
    const pollId = window.setInterval(() => {
      attempts += 1;
      markReady();
      if (initSentRef.current || attempts >= 40) window.clearInterval(pollId);
    }, 500);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("message", onMessage);
    };
  }, [enabled, markReady]);

  useEffect(() => {
    if (!enabled) return undefined;

    const postedEventIds = new Set();

    async function persistZoomEvent(payload) {
      const type = payload?.type;
      if (
        type !== "zp-call-ringing-event" &&
        type !== "zp-call-connected-event" &&
        type !== "zp-call-ended-event" &&
        type !== "zp-call-log-completed-event"
      ) {
        return;
      }
      markReady();
      const dedupeKey =
        payload?.id != null ? String(payload.id) : `${type}:${payload?.data?.callId || ""}`;
      if (dedupeKey && postedEventIds.has(dedupeKey)) return;
      if (dedupeKey) postedEventIds.add(dedupeKey);
      if (postedEventIds.size > 200) {
        const first = postedEventIds.values().next().value;
        postedEventIds.delete(first);
      }

      try {
        await fetch("/api/calls/zoom/event", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: payload.id ?? null,
            type,
            data: payload.data || {},
          }),
        });
      } catch {
        /* best-effort history sync */
      }
    }

    return subscribeZoomSmartEmbedEvents((payload) => {
      setLastEvent(payload);
      void persistZoomEvent(payload);
    });
  }, [enabled, markReady]);

  const makeCall = useCallback(
    async (number, opts) => {
      if (!enabled) return false;
      if (getZoomIframe()?.contentWindow) markReady();

      const trimmed = String(number || "").trim();
      if (!trimmed) return false;

      // Gate only — no CallLog. Soft Embed may fail even with Zoom enabled (no Phone
      // license / not signed in). CallLogs + Live Status come from Soft Embed events.
      try {
        const res = await fetch("/api/calls/zoom/start", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toNumber: trimmed }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          console.warn("[zoom] dial blocked", json?.error || res.status);
          return false;
        }
      } catch (err) {
        console.warn("[zoom] dial blocked", err);
        return false;
      }

      return zoomMakeCall(trimmed, opts);
    },
    [enabled, markReady],
  );

  const inputSms = useCallback(
    (number, message) => {
      if (!enabled) return false;
      if (getZoomIframe()?.contentWindow) markReady();
      return zoomInputSms(number, message);
    },
    [enabled, markReady],
  );

  const value = useMemo(
    () => ({
      enabled,
      ready,
      lastEvent,
      makeCall,
      inputSms,
      onIframeLoad,
    }),
    [enabled, ready, lastEvent, makeCall, inputSms, onIframeLoad],
  );

  return <ZoomSmartEmbedContext.Provider value={value}>{children}</ZoomSmartEmbedContext.Provider>;
}

export function useZoomSmartEmbed() {
  return useContext(ZoomSmartEmbedContext);
}
