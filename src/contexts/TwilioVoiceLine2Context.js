"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLine2Call } from "@/contexts/Line2CallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { useDialerCapabilities } from "@/contexts/DialerCapabilitiesContext";
import { patchTwilioVoiceSoundsForAutoplayPolicy } from "@/lib/twilioVoiceSoundPatch";

const TwilioVoiceLine2Context = createContext(undefined);

function getIncomingCallSid(call) {
  try {
    const p = call?.parameters;
    if (p && typeof p.get === "function") {
      return String(p.get("CallSid") || p.get("callSid") || "").trim();
    }
    return String(p?.CallSid || p?.callSid || "").trim();
  } catch {
    return "";
  }
}

function keepaliveEndCall(callId) {
  const id = Number(callId);
  if (!Number.isInteger(id) || id <= 0) return;
  try {
    void fetch("/api/calls/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ callId: id }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export function TwilioVoiceLine2Provider({ children }) {
  const { canUseDialer2 } = useDialerCapabilities();
  const { isPrimaryTab } = useTwilioVoice();
  const { session, sessionSyncRef, endCall, markInProgress } = useLine2Call();
  const [muted, setMuted] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [sdkInitializing, setSdkInitializing] = useState(false);
  const callRef = useRef(null);
  const deviceRef = useRef(null);
  const deviceInitPromiseRef = useRef(null);
  const expectedIncomingUntilRef = useRef(0);
  const attemptedWarmRegistrationRef = useRef(false);
  const deviceIdentityRef = useRef(null);
  const isPrimaryTabRef = useRef(false);
  const ownerCallIdRef = useRef(null);

  useEffect(() => {
    isPrimaryTabRef.current = isPrimaryTab === true;
  }, [isPrimaryTab]);

  useEffect(() => {
    const callId = Number(session?.callId);
    if (!Number.isInteger(callId) || callId <= 0) return;
    ownerCallIdRef.current = callId;
  }, [session?.callId]);

  const destroyDevice = useCallback(() => {
    deviceRef.current?.destroy();
    deviceRef.current = null;
    deviceInitPromiseRef.current = null;
    deviceIdentityRef.current = null;
    setRegistered(false);
    setVoiceConnected(false);
    setMuted(false);
  }, []);

  const isFatalDeviceError = useCallback((err) => {
    const code = Number(err?.code);
    if (Number.isFinite(code) && (code === 20101 || code === 31005 || code === 31205)) return true;
    const message = String(err?.message || "").toLowerCase();
    return (
      message.includes("jwt token expired") ||
      message.includes("access token expired") ||
      message.includes("authentication failed") ||
      message.includes("token is invalid")
    );
  }, []);

  const bindActiveCallEvents = useCallback(
    (call) => {
      callRef.current = call;
      setMuted(call.isMuted());
      setVoiceConnected(true);
      markInProgress();
      call.on("mute", (isMuted) => setMuted(isMuted));
      call.on("disconnect", () => {
        callRef.current = null;
        setVoiceConnected(false);
        setMuted(false);
        if (!sessionSyncRef.current) return;
        endCall();
      });
    },
    [endCall, markInProgress, sessionSyncRef],
  );

  const endOwnedCallOnUnload = useCallback(() => {
    const snap = sessionSyncRef.current;
    const callIdFromSession = Number(snap?.callId);
    const callId =
      Number.isInteger(callIdFromSession) && callIdFromSession > 0
        ? callIdFromSession
        : ownerCallIdRef.current;
    if (!callId) return;
    keepaliveEndCall(callId);
  }, [sessionSyncRef]);

  useEffect(() => {
    return () => {
      endOwnedCallOnUnload();
      callRef.current?.disconnect();
      callRef.current = null;
      destroyDevice();
    };
  }, [destroyDevice, endOwnedCallOnUnload]);

  const ensureRegistered = useCallback(async () => {
    if (!canUseDialer2) return false;
    if (isPrimaryTabRef.current === false) return false;
    if (deviceRef.current && registered) return true;
    if (deviceInitPromiseRef.current) return deviceInitPromiseRef.current;

    setSdkInitializing(true);
    setSdkError(null);
    setRegistered(false);

    deviceInitPromiseRef.current = (async () => {
      const res = await fetch("/api/twilio/token-line2", { credentials: "include", cache: "no-store" });
      if (res.status === 403) {
        throw new Error("Second dialer is not enabled for this account");
      }
      if (res.status === 503) {
        throw new Error("Twilio browser agent is not configured");
      }
      if (!res.ok) {
        throw new Error(`Failed to create Line 2 voice token (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const token = data?.token;
      const identity = data?.identity || null;
      if (!token) throw new Error("Missing Line 2 voice token");
      if (deviceIdentityRef.current && identity && deviceIdentityRef.current !== identity) {
        destroyDevice();
      }

      await patchTwilioVoiceSoundsForAutoplayPolicy();
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, {
        logLevel: process.env.NODE_ENV === "development" ? "warn" : "error",
        disableAudioContextSounds: true,
      });
      deviceIdentityRef.current = identity;

      device.on("registered", () => setRegistered(true));
      device.on("unregistered", () => setRegistered(false));
      device.on("error", (err) => {
        setSdkError(err?.message || "Twilio Line 2 Device error");
        if (isFatalDeviceError(err)) destroyDevice();
      });

      device.on("incoming", (call) => {
        const sessionSnap = sessionSyncRef.current;
        const outboundExpectActive = expectedIncomingUntilRef.current > Date.now();
        const sessionHasResolvedCallId =
          Number.isInteger(Number(sessionSnap?.callId)) && Number(sessionSnap.callId) > 0;
        const shouldAutoAccept = sessionHasResolvedCallId || outboundExpectActive;

        const acceptAndBind = () => {
          try {
            call.accept();
            bindActiveCallEvents(call);
          } catch (err) {
            setSdkError(err?.message || "Unable to accept Line 2 call");
          }
        };

        if (!shouldAutoAccept) {
          try {
            call.reject();
          } catch {
            /* ignore */
          }
          return;
        }

        expectedIncomingUntilRef.current = 0;
        if (sessionHasResolvedCallId) {
          acceptAndBind();
          return;
        }

        let attempts = 0;
        const maxAttempts = 160;
        const tick = () => {
          attempts++;
          const snap = sessionSyncRef.current;
          const id = Number(snap?.callId);
          if (Number.isInteger(id) && id > 0) {
            acceptAndBind();
            return;
          }
          if (attempts >= maxAttempts) {
            try {
              call.reject();
            } catch {
              /* ignore */
            }
            setSdkError("Line 2 outbound leg arrived before the session was ready. Try again.");
            return;
          }
          window.setTimeout(tick, 25);
        };
        window.setTimeout(tick, 0);
      });

      await new Promise((resolve, reject) => {
        const timeoutMs = 10000;
        const t = window.setTimeout(() => {
          reject(new Error("Line 2 Twilio Device registration timed out"));
        }, timeoutMs);
        const onRegistered = () => {
          window.clearTimeout(t);
          resolve(true);
        };
        const onError = (err) => {
          window.clearTimeout(t);
          reject(err || new Error("Line 2 Twilio Device error"));
        };
        device.once("registered", onRegistered);
        device.once("error", onError);
        device.register().catch(onError);
      });
      deviceRef.current = device;
      return true;
    })();

    try {
      return await deviceInitPromiseRef.current;
    } finally {
      deviceInitPromiseRef.current = null;
      setSdkInitializing(false);
    }
  }, [
    canUseDialer2,
    registered,
    sessionSyncRef,
    bindActiveCallEvents,
    destroyDevice,
    isFatalDeviceError,
  ]);

  useEffect(() => {
    if (!canUseDialer2) {
      if (deviceRef.current) destroyDevice();
      attemptedWarmRegistrationRef.current = false;
      return;
    }
    if (isPrimaryTab === null) return;
    if (isPrimaryTab === false) {
      if (deviceRef.current) destroyDevice();
      attemptedWarmRegistrationRef.current = false;
      return;
    }
    if (attemptedWarmRegistrationRef.current) return;
    attemptedWarmRegistrationRef.current = true;
    void ensureRegistered().catch((err) => {
      attemptedWarmRegistrationRef.current = false;
      setSdkError(err?.message || "Unable to register Line 2");
    });
  }, [canUseDialer2, isPrimaryTab, destroyDevice, ensureRegistered]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.isMuted();
    call.mute(next);
    setMuted(next);
  }, []);

  const sendDtmf = useCallback((digits) => {
    const call = callRef.current;
    if (!call) return false;
    const clean = String(digits || "").replace(/[^0-9*#wW]/g, "");
    if (!clean) return false;
    try {
      call.sendDigits(clean);
      return true;
    } catch {
      return false;
    }
  }, []);

  const expectOutgoingIncomingLeg = useCallback((ttlMs = 45000) => {
    const ttl = Number(ttlMs);
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : 45000;
    expectedIncomingUntilRef.current = Date.now() + safeTtl;
  }, []);

  const hangup = useCallback(async () => {
    await endCall();
    if (callRef.current) {
      try {
        callRef.current.disconnect();
      } catch {
        /* ignore */
      }
    }
  }, [endCall]);

  return (
    <TwilioVoiceLine2Context.Provider
      value={{
        muted,
        sdkError,
        sdkInitializing,
        registered,
        voiceConnected,
        toggleMute,
        sendDtmf,
        ensureRegistered,
        expectOutgoingIncomingLeg,
        hangup,
        enabled: canUseDialer2,
      }}
    >
      {children}
    </TwilioVoiceLine2Context.Provider>
  );
}

export function useTwilioVoiceLine2() {
  const ctx = useContext(TwilioVoiceLine2Context);
  if (!ctx) throw new Error("useTwilioVoiceLine2 must be used within TwilioVoiceLine2Provider");
  return ctx;
}
