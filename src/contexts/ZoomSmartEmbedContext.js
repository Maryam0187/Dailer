"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  buildZoomPhoneIframeUrl,
  getZoomIframe,
  initZoomSmartEmbed,
  subscribeZoomSmartEmbedEvents,
  zoomInputSms,
  zoomMakeCall,
  ZOOM_PHONE_ORIGIN,
  ZOOM_PHONE_SDK_URL,
} from "@/lib/zoomSmartEmbed";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import { useDialerCapabilities } from "@/contexts/DialerCapabilitiesContext";

const ZoomSmartEmbedContext = createContext({
  enabled: false,
  ready: false,
  lastEvent: null,
  makeCall: () => false,
  inputSms: () => false,
});

export function ZoomSmartEmbedProvider({ children }) {
  const { canUseZoomPhone } = useDialerCapabilities();
  const enabled = ZOOM_SMART_EMBED_ENABLED && Boolean(canUseZoomPhone);
  const [ready, setReady] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const readyRef = useRef(false);
  const initSentRef = useRef(false);

  const markReady = useCallback(() => {
    if (!initSentRef.current) {
      // Softphone UI can work before our init; send config when iframe exists.
      if (getZoomIframe()?.contentWindow) {
        initZoomSmartEmbed();
        initSentRef.current = true;
      }
    }
    if (!readyRef.current) {
      readyRef.current = true;
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      readyRef.current = false;
      initSentRef.current = false;
      setReady(false);
      return undefined;
    }

    const previousReady = window.onZoomPhoneIframeApiReady;
    const previousIframeUrl = window.PHONESDKIFRAMEURL;

    window.PHONESDKIFRAMEURL = buildZoomPhoneIframeUrl(window.location.origin);

    window.onZoomPhoneIframeApiReady = () => {
      markReady();
      if (typeof previousReady === "function") {
        try {
          previousReady();
        } catch {
          /* ignore */
        }
      }
    };

    // Undocumented but observed: iframe posts zp-ready when Soft Embed is usable.
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

    // Poll for SDK-injected iframe — Soft Embed can work even if ready callback never fires.
    let attempts = 0;
    const pollId = window.setInterval(() => {
      attempts += 1;
      if (getZoomIframe()?.contentWindow) {
        markReady();
        window.clearInterval(pollId);
        return;
      }
      if (attempts >= 40) window.clearInterval(pollId);
    }, 500);

    const existing = document.querySelector(`script[data-zoom-smart-embed="1"]`);
    if (!existing) {
      const script = document.createElement("script");
      script.src = ZOOM_PHONE_SDK_URL;
      script.async = true;
      script.dataset.zoomSmartEmbed = "1";
      script.onerror = () => {
        readyRef.current = false;
        setReady(false);
      };
      document.body.appendChild(script);
    } else if (getZoomIframe()?.contentWindow) {
      markReady();
    }

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("message", onMessage);
      window.onZoomPhoneIframeApiReady = previousReady;
      window.PHONESDKIFRAMEURL = previousIframeUrl;
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
      const dedupeKey = payload?.id != null ? String(payload.id) : `${type}:${payload?.data?.callId || ""}`;
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
    (number, opts) => {
      if (!enabled) return false;
      // Softphone may already be usable even if our ready flag lagged.
      if (getZoomIframe()?.contentWindow) markReady();
      return zoomMakeCall(number, opts);
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
    }),
    [enabled, ready, lastEvent, makeCall, inputSms],
  );

  return <ZoomSmartEmbedContext.Provider value={value}>{children}</ZoomSmartEmbedContext.Provider>;
}

export function useZoomSmartEmbed() {
  return useContext(ZoomSmartEmbedContext);
}
