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
  const [sdkInitializing, setSdkInitializing] = useState(false);
  const callRef = useRef(null);
  const deviceRef = useRef(null);
  const deviceInitPromiseRef = useRef(null);

  // Cleanup when the provider unmounts.
  useEffect(() => {
    return () => {
      callRef.current?.disconnect();
      callRef.current = null;
      deviceRef.current?.destroy();
      deviceRef.current = null;
      deviceInitPromiseRef.current = null;
    };
  }, []);

  const ensureRegistered = useCallback(async () => {
    // If already initialized, just wait until we have a registered device.
    if (deviceRef.current && registered) return true;
    if (deviceInitPromiseRef.current) return deviceInitPromiseRef.current;

    setSdkInitializing(true);
    setSdkError(null);
    setRegistered(false);

    deviceInitPromiseRef.current = (async () => {
      const res = await fetch("/api/twilio/token", { credentials: "include" });
      if (res.status === 503) {
        throw new Error("Twilio browser agent is not configured");
      }
      if (!res.ok) {
        throw new Error(`Failed to create Twilio voice token (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      const token = data?.token;
      if (!token) throw new Error("Missing Twilio voice token");

      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, { logLevel: 1 });

      device.on("registered", () => setRegistered(true));

      device.on("error", (err) => {
        setSdkError(err?.message || "Twilio Device error");
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

      // Await registration (so Twilio doesn't dial an unregistered identity).
      await new Promise((resolve, reject) => {
        const timeoutMs = 10000;
        const t = window.setTimeout(() => {
          reject(new Error("Twilio Device registration timed out"));
        }, timeoutMs);

        const onRegistered = () => {
          window.clearTimeout(t);
          resolve(true);
        };

        const onError = (err) => {
          window.clearTimeout(t);
          reject(err || new Error("Twilio Device error"));
        };

        device.once("registered", onRegistered);
        device.once("error", onError);
        device.register().catch(onError);
      });
      deviceRef.current = device;
      return true;
    })();

    try {
      const ok = await deviceInitPromiseRef.current;
      return ok;
    } finally {
      deviceInitPromiseRef.current = null;
      setSdkInitializing(false);
    }
  }, [registered, markInProgress, endCall]);

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
        sdkInitializing,
        registered,
        voiceConnected,
        toggleMute,
        ensureRegistered,
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
