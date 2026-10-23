"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  buildZoomPhoneIframeUrl,
  initZoomSmartEmbed,
  subscribeZoomSmartEmbedEvents,
  zoomInputSms,
  zoomMakeCall,
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

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return undefined;
    }

    const previousReady = typeof window !== "undefined" ? window.onZoomPhoneIframeApiReady : undefined;
    const previousIframeUrl = typeof window !== "undefined" ? window.PHONESDKIFRAMEURL : undefined;

    // Help Zoom match Marketplace Approved Domains to this page origin.
    window.PHONESDKIFRAMEURL = buildZoomPhoneIframeUrl(window.location.origin);

    window.onZoomPhoneIframeApiReady = () => {
      initZoomSmartEmbed();
      setReady(true);
      if (typeof previousReady === "function") {
        try {
          previousReady();
        } catch {
          /* ignore prior handler errors */
        }
      }
    };

    const existing = document.querySelector(`script[data-zoom-smart-embed="1"]`);
    if (existing) {
      return () => {
        window.onZoomPhoneIframeApiReady = previousReady;
        window.PHONESDKIFRAMEURL = previousIframeUrl;
      };
    }

    const script = document.createElement("script");
    script.src = ZOOM_PHONE_SDK_URL;
    script.async = true;
    script.dataset.zoomSmartEmbed = "1";
    script.onerror = () => setReady(false);
    document.body.appendChild(script);

    return () => {
      window.onZoomPhoneIframeApiReady = previousReady;
      window.PHONESDKIFRAMEURL = previousIframeUrl;
    };
  }, [enabled]);

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
  }, [enabled]);

  const makeCall = useCallback(
    (number, opts) => {
      if (!enabled) return false;
      return zoomMakeCall(number, opts);
    },
    [enabled],
  );

  const inputSms = useCallback(
    (number, message) => {
      if (!enabled) return false;
      return zoomInputSms(number, message);
    },
    [enabled],
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
