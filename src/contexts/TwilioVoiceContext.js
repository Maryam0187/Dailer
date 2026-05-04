"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";

const TwilioVoiceContext = createContext(undefined);

export function TwilioVoiceProvider({ children }) {
  const { session, endCall, markInProgress } = useActiveCall();
  const [muted, setMuted] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const callRef = useRef(null);
  const deviceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/twilio/token", { credentials: "include" });
        if (res.status === 503) {
          return;
        }
        if (!res.ok) return;

        const data = await res.json().catch(() => ({}));
        const token = data?.token;
        if (!token || cancelled) return;

        const { Device } = await import("@twilio/voice-sdk");
        const device = new Device(token, { logLevel: 1 });

        device.on("registered", () => {
          if (!cancelled) setRegistered(true);
        });

        device.on("error", (err) => {
          if (!cancelled) setSdkError(err?.message || "Twilio Device error");
        });

        device.on("incoming", (call) => {
          call.accept();
          callRef.current = call;
          setMuted(call.isMuted());
          setVoiceConnected(true);
          markInProgress();

          call.on("mute", (isMuted) => setMuted(isMuted));
          call.on("disconnect", () => {
            callRef.current = null;
            setVoiceConnected(false);
            setMuted(false);
            endCall();
          });
        });

        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        deviceRef.current = device;
      } catch (e) {
        if (!cancelled) setSdkError(e?.message || "Voice SDK init failed");
      }
    })();

    return () => {
      cancelled = true;
      callRef.current?.disconnect();
      callRef.current = null;
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setRegistered(false);
      setVoiceConnected(false);
      setMuted(false);
    };
  }, [markInProgress, endCall]);

  useEffect(() => {
    if (session) return;
    const active = callRef.current;
    if (active) {
      active.disconnect();
      callRef.current = null;
      setVoiceConnected(false);
      setMuted(false);
    }
  }, [session]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.isMuted();
    call.mute(next);
    setMuted(next);
  }, []);

  return (
    <TwilioVoiceContext.Provider
      value={{
        muted,
        sdkError,
        registered,
        voiceConnected,
        toggleMute,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
}

export function useTwilioVoice() {
  const ctx = useContext(TwilioVoiceContext);
  if (!ctx) throw new Error("useTwilioVoice must be used within TwilioVoiceProvider");
  return ctx;
}
