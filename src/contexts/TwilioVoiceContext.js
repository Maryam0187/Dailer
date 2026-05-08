"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { useActiveCall } from "@/contexts/ActiveCallContext";

const TwilioVoiceContext = createContext(undefined);

export function TwilioVoiceProvider({ children }) {
  const { session, beginSession, patchSession, endCall, markInProgress } = useActiveCall();
  const [muted, setMuted] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [sdkInitializing, setSdkInitializing] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [inviteNotification, setInviteNotification] = useState(null);
  const [agentJoinedNotification, setAgentJoinedNotification] = useState(null);
  const callRef = useRef(null);
  const deviceRef = useRef(null);
  const deviceInitPromiseRef = useRef(null);
  const incomingCallRef = useRef(null);
  const expectedIncomingUntilRef = useRef(0);
  const expectedInviteJoinUntilRef = useRef(0);
  const attemptedWarmRegistrationRef = useRef(false);
  const deviceIdentityRef = useRef(null);
  const inviteToneCtxRef = useRef(null);
  const inviteToneIntervalRef = useRef(null);
  const callIdResolveSidRef = useRef(null);

  const destroyDevice = useCallback(() => {
    deviceRef.current?.destroy();
    deviceRef.current = null;
    deviceInitPromiseRef.current = null;
    deviceIdentityRef.current = null;
    incomingCallRef.current = null;
    setIncomingInvite(null);
    setRegistered(false);
    setVoiceConnected(false);
    setMuted(false);
  }, []);

  const stopInviteTone = useCallback(() => {
    if (inviteToneIntervalRef.current) {
      window.clearInterval(inviteToneIntervalRef.current);
      inviteToneIntervalRef.current = null;
    }
    if (inviteToneCtxRef.current) {
      inviteToneCtxRef.current.close().catch(() => {});
      inviteToneCtxRef.current = null;
    }
  }, []);

  const startInviteTone = useCallback(() => {
    if (inviteToneIntervalRef.current || typeof window === "undefined") return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const ctx = new AudioContextCtor();
      inviteToneCtxRef.current = ctx;
      const playBeep = () => {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.24);
      };
      playBeep();
      inviteToneIntervalRef.current = window.setInterval(playBeep, 1400);
    } catch {
      // Ignore autoplay/audio-context restrictions.
    }
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
        endCall();
      });
    },
    [endCall, markInProgress],
  );

  // Cleanup when the provider unmounts.
  useEffect(() => {
    return () => {
      callRef.current?.disconnect();
      callRef.current = null;
      stopInviteTone();
      destroyDevice();
    };
  }, [destroyDevice, stopInviteTone]);

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
      const identity = data?.identity || null;
      if (!token) throw new Error("Missing Twilio voice token");
      if (deviceIdentityRef.current && identity && deviceIdentityRef.current !== identity) {
        // Auth context changed (account switch): reset and rebuild with new identity.
        destroyDevice();
      }

      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, {
        logLevel: 1,
        // Suppress SDK-generated beeps/ringtones (accept/connect tones).
        // This does not mute actual call media audio.
        disableAudioContextSounds: true,
      });
      deviceIdentityRef.current = identity;

      device.on("registered", () => setRegistered(true));

      device.on("error", (err) => {
        setSdkError(err?.message || "Twilio Device error");
        if (isFatalDeviceError(err)) {
          destroyDevice();
        }
      });

      device.on("incoming", (call) => {
        // If this browser already has an active/connecting session, this is
        // the expected call leg for that session -> auto-join without prompt.
        const hasPendingInviteNotification = Boolean(inviteNotification) && !session;
        const inviteJoinIntentActive = expectedInviteJoinUntilRef.current > Date.now();
        const shouldAutoAccept =
          (inviteJoinIntentActive && hasPendingInviteNotification) ||
          (!hasPendingInviteNotification &&
            (session?.callId || session?.conferenceName || expectedIncomingUntilRef.current > Date.now()));
        if (shouldAutoAccept) {
          expectedIncomingUntilRef.current = 0;
          expectedInviteJoinUntilRef.current = 0;
          setIncomingInvite(null);
          incomingCallRef.current = null;
          if (!session) {
            beginSession({
              callId: null,
              callOwnedByMe: false,
              conferenceName: null,
              inviteCallSid: String(call?.parameters?.CallSid || "").trim() || null,
              customerName: String(call?.customParameters?.get?.("customerName") || "").trim() || "Customer",
              phoneLabel: call?.parameters?.From || "",
              toNumber: call?.parameters?.From || "",
            });
          }
          call.accept();
          bindActiveCallEvents(call);
          return;
        }

        incomingCallRef.current = call;
        const from = String(call?.parameters?.From || "").trim();
        const baseInvite = {
          from: from || "Conference invite",
          callSid: call?.parameters?.CallSid || null,
          customerName: String(call?.customParameters?.get?.("customerName") || "").trim() || "Customer",
          callId: null,
          conferenceName: null,
          participants: [],
        };
        setIncomingInvite(baseInvite);

        const sidForContext = baseInvite.callSid;
        if (sidForContext) {
          fetch(`/api/calls/invite-context?callSid=${encodeURIComponent(sidForContext)}`, {
            credentials: "include",
          })
            .then((res) => res.json().catch(() => ({})))
            .then((json) => {
              setIncomingInvite((prev) => {
                if (!prev || prev.callSid !== sidForContext) return prev;
                return {
                  ...prev,
                  callId: Number.isInteger(Number(json?.callId)) ? Number(json.callId) : null,
                  conferenceName: json?.conferenceName || null,
                  participants: Array.isArray(json?.participants) ? json.participants : [],
                };
              });
            })
            .catch(() => {
              // Best effort only; dialog still works without context list.
            });
        }

        call.on("cancel", () => {
          incomingCallRef.current = null;
          setIncomingInvite(null);
        });
        call.on("reject", () => {
          incomingCallRef.current = null;
          setIncomingInvite(null);
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
  }, [registered, session, inviteNotification, beginSession, bindActiveCallEvents, destroyDevice, isFatalDeviceError]);

  // Keep browser reachable for invite legs while idle, but only
  // after a real user gesture so browsers allow AudioContext startup.
  useEffect(() => {
    if (attemptedWarmRegistrationRef.current) return;
    const prime = () => {
      if (attemptedWarmRegistrationRef.current) return;
      attemptedWarmRegistrationRef.current = true;
      ensureRegistered().catch(() => {});
    };

    const opts = { once: true, passive: true };
    window.addEventListener("pointerdown", prime, opts);
    window.addEventListener("keydown", prime, opts);
    window.addEventListener("touchstart", prime, opts);
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
      window.removeEventListener("touchstart", prime);
    };
  }, [ensureRegistered]);

  useEffect(() => {
    if (session) return;
    const active = callRef.current;
    if (active) {
      active.disconnect();
      callRef.current = null;
    }
    incomingCallRef.current = null;
    setIncomingInvite(null);
    expectedIncomingUntilRef.current = 0;
    expectedInviteJoinUntilRef.current = 0;
    setVoiceConnected(false);
    setMuted(false);
  }, [session]);

  useEffect(() => {
    if (incomingInvite || inviteNotification) startInviteTone();
    else stopInviteTone();
  }, [incomingInvite, inviteNotification, startInviteTone, stopInviteTone]);

  useEffect(() => {
    const hasResolvedCallId = Number.isInteger(Number(session?.callId)) && Number(session?.callId) > 0;
    const sid = String(session?.inviteCallSid || "").trim();
    if (!session || hasResolvedCallId || !sid) {
      callIdResolveSidRef.current = null;
      return;
    }
    if (callIdResolveSidRef.current === sid) return;
    callIdResolveSidRef.current = sid;

    fetch(`/api/calls/invite-context?callSid=${encodeURIComponent(sid)}`, {
      credentials: "include",
    })
      .then((res) => res.json().catch(() => ({})))
      .then((json) => {
        const resolvedCallId = Number(json?.callId);
        const resolvedConferenceName = String(json?.conferenceName || "").trim();
        patchSession((current) => {
          if (!current) return null;
          const currentHasCallId =
            Number.isInteger(Number(current.callId)) && Number(current.callId) > 0;
          if (currentHasCallId) return null;
          const nextPatch = {};
          if (Number.isInteger(resolvedCallId) && resolvedCallId > 0) nextPatch.callId = resolvedCallId;
          if (!current.conferenceName && resolvedConferenceName) nextPatch.conferenceName = resolvedConferenceName;
          return Object.keys(nextPatch).length ? nextPatch : null;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (callIdResolveSidRef.current === sid) callIdResolveSidRef.current = null;
      });
  }, [session, session?.callId, session?.inviteCallSid, session?.conferenceName, patchSession]);

  useEffect(() => {
    function onLogout() {
      destroyDevice();
    }

    function onPageClose() {
      destroyDevice();
    }

    window.addEventListener("auth:logout", onLogout);
    window.addEventListener("beforeunload", onPageClose);
    window.addEventListener("pagehide", onPageClose);
    return () => {
      window.removeEventListener("auth:logout", onLogout);
      window.removeEventListener("beforeunload", onPageClose);
      window.removeEventListener("pagehide", onPageClose);
    };
  }, [destroyDevice]);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("call:invite", (payload) => {
      // New invite should ring/show prompt, not be auto-accepted by stale window.
      expectedIncomingUntilRef.current = 0;
      setInviteNotification({
        fromAgent: payload?.fromAgent || "Unknown",
        callId: Number(payload?.callId) || null,
        conferenceName: payload?.conferenceName || null,
        customer: payload?.customer || null,
        participants: Array.isArray(payload?.participants) ? payload.participants : [],
        sentAt: payload?.sentAt || null,
      });
    });
    socket.on("call:agent-joined", (payload) => {
      setAgentJoinedNotification({
        callId: Number(payload?.callId) || null,
        joinedAgent: payload?.joinedAgent || "Agent",
        customer: payload?.customer || null,
        joinedAt: payload?.joinedAt || null,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

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

  const acceptIncomingInvite = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return false;
    setSdkError(null);
    setIncomingInvite(null);
    stopInviteTone();
    try {
      call.accept();
      incomingCallRef.current = null;
      // Only create a synthetic session if there isn't one already.
      if (!session) {
        const inviteCallId = Number(incomingInvite?.callId || inviteNotification?.callId);
        const inviteCallSid = String(incomingInvite?.callSid || "").trim() || null;
        beginSession({
          callId: Number.isInteger(inviteCallId) && inviteCallId > 0 ? inviteCallId : null,
          callOwnedByMe: false,
          conferenceName: incomingInvite?.conferenceName || inviteNotification?.conferenceName || null,
          inviteCallSid: inviteCallSid,
          customerName: incomingInvite?.customerName?.trim() || "Customer",
          phoneLabel: call?.parameters?.From || "",
          toNumber: call?.parameters?.From || "",
        });
      }
      bindActiveCallEvents(call);
      return true;
    } catch (err) {
      setSdkError(err?.message || "Unable to join incoming call");
      return false;
    }
  }, [session, incomingInvite, inviteNotification, beginSession, bindActiveCallEvents, stopInviteTone]);

  const rejectIncomingInvite = useCallback(() => {
    const call = incomingCallRef.current;
    setIncomingInvite(null);
    stopInviteTone();
    if (!call) return;
    try {
      call.reject();
    } finally {
      incomingCallRef.current = null;
    }
  }, [stopInviteTone]);

  const dismissInviteNotification = useCallback(() => {
    setInviteNotification(null);
  }, []);

  const dismissAgentJoinedNotification = useCallback(() => {
    setAgentJoinedNotification(null);
  }, []);

  const expectInviteJoinIncomingLeg = useCallback((ttlMs = 45000) => {
    const ttl = Number(ttlMs);
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : 45000;
    expectedInviteJoinUntilRef.current = Date.now() + safeTtl;
  }, []);

  const expectOutgoingIncomingLeg = useCallback((ttlMs = 45000) => {
    const ttl = Number(ttlMs);
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : 45000;
    expectedIncomingUntilRef.current = Date.now() + safeTtl;
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
        sendDtmf,
        ensureRegistered,
        incomingInvite,
        inviteNotification,
        agentJoinedNotification,
        acceptIncomingInvite,
        rejectIncomingInvite,
        dismissInviteNotification,
        dismissAgentJoinedNotification,
        expectInviteJoinIncomingLeg,
        expectOutgoingIncomingLeg,
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
