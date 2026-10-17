"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLine2Call } from "@/contexts/Line2CallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { useDialerCapabilities } from "@/contexts/DialerCapabilitiesContext";
import { deriveCallQualityLevel, normalizeQualityWarningName } from "@/lib/callQuality";
import { patchTwilioVoiceSoundsForAutoplayPolicy } from "@/lib/twilioVoiceSoundPatch";
import {
  TWILIO_VOICE_DEVICE_OPTIONS,
  TWILIO_VOICE_MAX_SIGNAL_FLAPS,
  destroyTwilioVoiceDevice,
  formatTwilioVoiceDeviceError,
  isFatalTwilioVoiceDeviceError,
  twilioVoiceRegisterBackoffMs,
} from "@/lib/twilioVoiceDevice";

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
  // Wait for Line 1 to finish registering so we do not open 2–4 /signal sockets at once.
  const { isPrimaryTab, registered: line1Registered } = useTwilioVoice();
  const { session, sessionSyncRef, endCall, markInProgress } = useLine2Call();
  const [muted, setMuted] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [sdkInitializing, setSdkInitializing] = useState(false);
  const [callQuality, setCallQuality] = useState(null);
  const qualityMosRef = useRef(null);
  const qualityWarningsRef = useRef(new Set());
  const callRef = useRef(null);
  const deviceRef = useRef(null);
  const deviceInitPromiseRef = useRef(null);
  const expectedIncomingUntilRef = useRef(0);
  const attemptedWarmRegistrationRef = useRef(false);
  const deviceIdentityRef = useRef(null);
  const isPrimaryTabRef = useRef(false);
  const ownerCallIdRef = useRef(null);
  const registerFailureCountRef = useRef(0);
  const registerBackoffUntilRef = useRef(0);
  const manualRetryRequiredRef = useRef(false);

  useEffect(() => {
    isPrimaryTabRef.current = isPrimaryTab === true;
  }, [isPrimaryTab]);

  useEffect(() => {
    const callId = Number(session?.callId);
    if (!Number.isInteger(callId) || callId <= 0) return;
    ownerCallIdRef.current = callId;
  }, [session?.callId]);

  const clearCallQuality = useCallback(() => {
    qualityMosRef.current = null;
    qualityWarningsRef.current = new Set();
    setCallQuality(null);
  }, []);

  const publishCallQuality = useCallback(() => {
    const mos = qualityMosRef.current;
    const level = deriveCallQualityLevel({
      mos,
      activeWarnings: qualityWarningsRef.current,
    });
    if (level == null && mos == null && qualityWarningsRef.current.size === 0) {
      setCallQuality(null);
      return;
    }
    setCallQuality({ level, mos });
  }, []);

  const destroyDevice = useCallback(() => {
    destroyTwilioVoiceDevice(deviceRef.current);
    deviceRef.current = null;
    deviceInitPromiseRef.current = null;
    deviceIdentityRef.current = null;
    setRegistered(false);
    setVoiceConnected(false);
    setMuted(false);
    clearCallQuality();
  }, [clearCallQuality]);

  const isFatalDeviceError = useCallback((err) => isFatalTwilioVoiceDeviceError(err), []);

  const noteRegisterFailure = useCallback((err) => {
    registerFailureCountRef.current += 1;
    manualRetryRequiredRef.current = true;
    attemptedWarmRegistrationRef.current = true;
    const waitMs = twilioVoiceRegisterBackoffMs(registerFailureCountRef.current);
    registerBackoffUntilRef.current = Date.now() + waitMs;
    setSdkError(`${formatTwilioVoiceDeviceError(err)} Click “Retry Voice” to try again.`);
    setRegistered(false);
    return waitMs;
  }, []);

  const clearRegisterBackoff = useCallback(() => {
    registerFailureCountRef.current = 0;
    registerBackoffUntilRef.current = 0;
    manualRetryRequiredRef.current = false;
  }, []);

  const bindActiveCallEvents = useCallback(
    (call) => {
      callRef.current = call;
      setMuted(call.isMuted());
      setVoiceConnected(true);
      markInProgress();
      clearCallQuality();
      call.on("mute", (isMuted) => setMuted(isMuted));
      call.on("sample", (sample) => {
        const mos = typeof sample?.mos === "number" && Number.isFinite(sample.mos) ? sample.mos : null;
        qualityMosRef.current = mos;
        publishCallQuality();
      });
      call.on("warning", (name) => {
        const key = normalizeQualityWarningName(name);
        if (!key) return;
        qualityWarningsRef.current.add(key);
        publishCallQuality();
      });
      call.on("warning-cleared", (name) => {
        const key = normalizeQualityWarningName(name);
        if (!key) return;
        qualityWarningsRef.current.delete(key);
        publishCallQuality();
      });
      call.on("disconnect", () => {
        callRef.current = null;
        setVoiceConnected(false);
        setMuted(false);
        clearCallQuality();
        if (!sessionSyncRef.current) return;
        endCall();
      });
    },
    [clearCallQuality, endCall, markInProgress, publishCallQuality, sessionSyncRef],
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

  const ensureRegistered = useCallback(async (options = {}) => {
    const force = Boolean(options?.force);
    if (!canUseDialer2) return false;
    if (isPrimaryTabRef.current === false) return false;
    if (deviceRef.current && registered) return true;
    if (deviceInitPromiseRef.current) return deviceInitPromiseRef.current;

    if (!force && manualRetryRequiredRef.current) {
      setSdkError((prev) => prev || "Line 2 voice signaling unavailable. Click “Retry Voice” to try again.");
      return false;
    }
    const now = Date.now();
    if (!force && registerBackoffUntilRef.current > now) {
      const waitSec = Math.ceil((registerBackoffUntilRef.current - now) / 1000);
      setSdkError(`Line 2 voice signaling unavailable. Retry in ${waitSec}s.`);
      return false;
    }
    if (force) clearRegisterBackoff();

    setSdkInitializing(true);
    setSdkError(null);
    setRegistered(false);

    deviceInitPromiseRef.current = (async () => {
      if (deviceRef.current) {
        destroyTwilioVoiceDevice(deviceRef.current);
        deviceRef.current = null;
        deviceIdentityRef.current = null;
        setRegistered(false);
      }

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
        destroyTwilioVoiceDevice(deviceRef.current);
        deviceRef.current = null;
        deviceIdentityRef.current = null;
      }

      await patchTwilioVoiceSoundsForAutoplayPolicy();
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, {
        logLevel: process.env.NODE_ENV === "development" ? "warn" : "error",
        disableAudioContextSounds: true,
        ...TWILIO_VOICE_DEVICE_OPTIONS,
      });
      deviceIdentityRef.current = identity;

      let hasReachedRegistered = false;
      let signalFlaps = 0;

      const killDeviceForSignaling = (err) => {
        noteRegisterFailure(err);
        destroyTwilioVoiceDevice(device);
        if (deviceRef.current === device) {
          deviceRef.current = null;
          deviceIdentityRef.current = null;
        }
        setRegistered(false);
      };

      device.on("registering", () => {
        if (!hasReachedRegistered) return;
        if (callRef.current) return;
        signalFlaps += 1;
        if (signalFlaps >= TWILIO_VOICE_MAX_SIGNAL_FLAPS) {
          killDeviceForSignaling(
            new Error("Line 2 voice signaling keep disconnecting (websocket close)."),
          );
        }
      });

      device.on("registered", () => {
        hasReachedRegistered = true;
        signalFlaps = 0;
        clearRegisterBackoff();
        setRegistered(true);
        setSdkError(null);
      });
      device.on("unregistered", () => setRegistered(false));
      device.on("error", (err) => {
        if (!isFatalDeviceError(err)) {
          setSdkError(formatTwilioVoiceDeviceError(err));
          return;
        }
        killDeviceForSignaling(err);
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

      try {
        await new Promise((resolve, reject) => {
          const timeoutMs = 8000;
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
      } catch (err) {
        destroyTwilioVoiceDevice(device);
        noteRegisterFailure(err);
        throw err;
      }
      deviceRef.current = device;
      clearRegisterBackoff();
      return true;
    })();

    try {
      return await deviceInitPromiseRef.current;
    } catch (err) {
      if (!registerBackoffUntilRef.current) {
        noteRegisterFailure(err);
      }
      return false;
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
    noteRegisterFailure,
    clearRegisterBackoff,
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
    if (registered) {
      attemptedWarmRegistrationRef.current = true;
      return;
    }
    // Stagger: Line 2 registers only after Line 1 is ready (or user dials Line 2 later).
    if (!line1Registered) return;
    if (manualRetryRequiredRef.current) return;
    if (attemptedWarmRegistrationRef.current) return;
    if (registerBackoffUntilRef.current > Date.now()) return;
    attemptedWarmRegistrationRef.current = true;
    void ensureRegistered().then((ok) => {
      if (!ok) manualRetryRequiredRef.current = true;
    });
  }, [
    canUseDialer2,
    isPrimaryTab,
    destroyDevice,
    ensureRegistered,
    registered,
    line1Registered,
  ]);

  const retryVoiceRegistration = useCallback(async () => {
    manualRetryRequiredRef.current = false;
    attemptedWarmRegistrationRef.current = false;
    destroyDevice();
    return ensureRegistered({ force: true });
  }, [destroyDevice, ensureRegistered]);

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
        callQuality,
        toggleMute,
        sendDtmf,
        ensureRegistered,
        retryVoiceRegistration,
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
