"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { logClientCallStatus } from "@/lib/callStatusLog";
import { patchTwilioVoiceSoundsForAutoplayPolicy } from "@/lib/twilioVoiceSoundPatch";

const TwilioVoiceContext = createContext(undefined);

// Single-active-tab lock parameters. Tuned so a crashed tab is detected by
// siblings within ~8 s while still being cheap (one localStorage write every
// 4 s, one read every 5 s in non-primary tabs).
const TAB_LOCK_KEY = "dialer:tabLock";
const TAB_LOCK_TTL_MS = 8000;
const TAB_LOCK_HEARTBEAT_MS = 4000;
const TAB_LOCK_STALE_CHECK_MS = 5000;

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

export function TwilioVoiceProvider({ children }) {
  const { session, sessionSyncRef, beginSession, patchSession, endCall, clearLocalSession, markInProgress } =
    useActiveCall();
  const [muted, setMuted] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [sdkInitializing, setSdkInitializing] = useState(false);
  /**
   * Twilio "unregistered" the Device because a newer Device registered with the
   * same identity (typically a second tab in this same browser). Active call —
   * if any — keeps running; only future incoming calls would route elsewhere.
   */
  const [voiceDisplaced, setVoiceDisplaced] = useState(false);
  /**
   * Single-active-tab lock (localStorage-backed). Only the primary tab in a
   * browser registers a Twilio Device and shows enabled call buttons. Secondary
   * tabs render a disabled state with a one-click "Use this tab" takeover.
   * `null` = lock state not yet read; render no-op until the mount effect runs.
   */
  const [isPrimaryTab, setIsPrimaryTab] = useState(null);
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
  /** Browsers block audio until a user gesture (autoplay policy). */
  const audioUnlockedRef = useRef(false);
  const pendingInviteRingRef = useRef(false);
  const callIdResolveSidRef = useRef(null);
  const inviteNotificationRef = useRef(null);
  /** True when user chose Leave — disconnect handler must not POST /api/calls/end. */
  const leaveWithoutEndingRef = useRef(false);
  /** Owner left on purpose; refresh must not complete the customer leg. */
  const leftConferenceWithoutEndingRef = useRef(false);
  /** Owner call id for refresh/unload teardown when React session is already gone. */
  const ownerCallIdRef = useRef(null);
  /** Stable ID for this tab; only generated client-side after mount. */
  const tabIdRef = useRef(null);
  /** Closure-stable mirror of {@link isPrimaryTab} for use inside refs/callbacks. */
  const isPrimaryTabRef = useRef(false);

  useEffect(() => {
    inviteNotificationRef.current = inviteNotification;
  }, [inviteNotification]);

  useEffect(() => {
    const callId = Number(session?.callId);
    if (session?.callOwnedByMe === false || !Number.isInteger(callId) || callId <= 0) return;
    ownerCallIdRef.current = callId;
    leftConferenceWithoutEndingRef.current = false;
  }, [session?.callId, session?.callOwnedByMe]);

  const endOwnedCallOnUnload = useCallback(() => {
    if (leftConferenceWithoutEndingRef.current) return;
    const snap = sessionSyncRef.current;
    const callIdFromSession = Number(snap?.callId);
    const callId =
      snap?.callOwnedByMe !== false &&
      Number.isInteger(callIdFromSession) &&
      callIdFromSession > 0
        ? callIdFromSession
        : ownerCallIdRef.current;
    if (!callId) return;
    keepaliveEndCall(callId);
  }, [sessionSyncRef]);

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
    if (!audioUnlockedRef.current) return;
    if (inviteToneIntervalRef.current || typeof window === "undefined") return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const ctx = new AudioContextCtor();
      inviteToneCtxRef.current = ctx;
      const playBeep = () => {
        const scheduleOsc = () => {
          try {
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
          } catch {
            // Autoplay / graph errors
          }
        };
        if (ctx.state === "suspended") {
          void ctx.resume().then(scheduleOsc).catch(() => {});
        } else {
          scheduleOsc();
        }
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
      const snap = sessionSyncRef.current;
      const callId = Number(snap?.callId);
      const callSid = getIncomingCallSid(call);

      let sdkStatus = null;
      try {
        sdkStatus = typeof call?.status === "function" ? call.status() : null;
      } catch {
        /* ignore */
      }
      logClientCallStatus("sdk:call-bound", {
        callId: Number.isInteger(callId) && callId > 0 ? callId : null,
        callSid: callSid || null,
        status: sdkStatus,
      });

      // Invited agents join without TwiML conference mute (bridge mute cannot be cleared
      // with SDK unmute). Force mic muted here so they start muted until they choose Unmute.
      const applyInvitedDefaultMute = () => {
        if (sessionSyncRef.current?.callOwnedByMe !== false) return;
        try {
          call.mute(true);
        } catch {
          /* ignore */
        }
      };
      applyInvitedDefaultMute();
      call.once("audio", applyInvitedDefaultMute);

      setMuted(call.isMuted());
      setVoiceConnected(true);
      markInProgress();

      const logSdk = (event, extra = {}) => {
        logClientCallStatus(`sdk:${event}`, {
          callId: Number.isInteger(callId) && callId > 0 ? callId : null,
          callSid: callSid || getIncomingCallSid(call) || null,
          ...extra,
        });
      };

      call.on("ringing", () => logSdk("ringing", { status: "ringing" }));
      call.on("accept", () => logSdk("accept", { status: "in-progress" }));
      call.on("mute", (isMuted) => setMuted(isMuted));
      call.on("disconnect", () => {
        logSdk("disconnect", { status: "completed" });
        callRef.current = null;
        setVoiceConnected(false);
        setMuted(false);
        if (leaveWithoutEndingRef.current) {
          leaveWithoutEndingRef.current = false;
          clearLocalSession();
          return;
        }
        if (!sessionSyncRef.current) return;
        if (!sessionSyncRef.current.callOwnedByMe) {
          clearLocalSession();
          return;
        }
        endCall();
      });
    },
    [clearLocalSession, endCall, markInProgress, sessionSyncRef],
  );

  // Cleanup when the provider unmounts.
  useEffect(() => {
    return () => {
      endOwnedCallOnUnload();
      callRef.current?.disconnect();
      callRef.current = null;
      stopInviteTone();
      destroyDevice();
    };
  }, [destroyDevice, endOwnedCallOnUnload, stopInviteTone]);

  const ensureRegistered = useCallback(async () => {
    // Single-active-tab guard: secondary tabs in this browser must NOT register
    // a Twilio Device. Without this, two tabs would each request a token, both
    // would register, and Twilio's "last register wins" would still let the
    // user start outgoing calls from either tab simultaneously.
    if (isPrimaryTabRef.current === false) return false;

    if (deviceRef.current && registered) return true;
    if (deviceInitPromiseRef.current) return deviceInitPromiseRef.current;

    setSdkInitializing(true);
    setSdkError(null);
    setRegistered(false);

    deviceInitPromiseRef.current = (async () => {
      const res = await fetch("/api/twilio/token", { credentials: "include", cache: "no-store" });
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

      await patchTwilioVoiceSoundsForAutoplayPolicy();
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, {
        // 1=debug is very noisy (WSTransport, EventPublisher, AudioHelper "incoming undefined").
        // "warn" keeps real issues without chatty Twilio internals.
        logLevel: process.env.NODE_ENV === "development" ? "warn" : "error",
        // Suppress SDK-generated beeps/ringtones (accept/connect tones).
        // This does not mute actual call media audio. HTMLAudio fallback then has no
        // `sounds.incoming` URL, so you may see "[AudioHelper] .incoming undefined" at
        // debug log level — harmless; use our in-app invite tone after user gesture.
        disableAudioContextSounds: true,
      });
      deviceIdentityRef.current = identity;

      device.on("registered", () => {
        setRegistered(true);
        setVoiceDisplaced(false);
      });

      // Twilio fires "unregistered" when a newer Device with the same identity
      // (another tab in this browser) registers and supersedes us. The current
      // active call is unaffected — only future incoming calls route to the new
      // tab. The UI uses this to surface "another tab is the active dialer" with
      // a one-click "Use this tab" takeover.
      device.on("unregistered", () => {
        setRegistered(false);
        setVoiceDisplaced(true);
      });

      device.on("error", (err) => {
        setSdkError(err?.message || "Twilio Device error");
        if (isFatalDeviceError(err)) {
          destroyDevice();
        }
      });

      device.on("incoming", (call) => {
        // If this browser already has an active/connecting session, this is
        // the expected call leg for that session -> auto-join without prompt.
        const sessionSnap = sessionSyncRef.current;
        const inviteNotify = inviteNotificationRef.current;
        const hasPendingInviteNotification = Boolean(inviteNotify) && !sessionSnap;
        const inviteJoinIntentActive = expectedInviteJoinUntilRef.current > Date.now();
        const outboundExpectActive = expectedIncomingUntilRef.current > Date.now();
        const sessionHasResolvedCallId =
          Number.isInteger(Number(sessionSnap?.callId)) && Number(sessionSnap.callId) > 0;
        const shouldAutoAccept =
          (inviteJoinIntentActive && hasPendingInviteNotification) ||
          (!hasPendingInviteNotification &&
            (sessionHasResolvedCallId ||
              sessionSnap?.conferenceName ||
              outboundExpectActive));

        if (shouldAutoAccept) {
          expectedIncomingUntilRef.current = 0;
          expectedInviteJoinUntilRef.current = 0;
          setIncomingInvite(null);
          incomingCallRef.current = null;

          const sid = getIncomingCallSid(call);
          const customerName =
            String(call?.customParameters?.get?.("customerName") || "").trim() || "Customer";
          const fromParam = call?.parameters?.From || "";

          const acceptAndBind = () => {
            try {
              call.accept();
              bindActiveCallEvents(call);
            } catch (err) {
              setSdkError(err?.message || "Unable to accept call");
            }
          };

          if (sessionSyncRef.current) {
            acceptAndBind();
            return;
          }

          const notifyCallId = Number(inviteNotify?.callId);
          if (Number.isInteger(notifyCallId) && notifyCallId > 0) {
            beginSession({
              callId: notifyCallId,
              callOwnedByMe: false,
              conferenceName: inviteNotify?.conferenceName || null,
              inviteCallSid: sid || null,
              customerName,
              phoneLabel: fromParam,
              toNumber: fromParam,
            });
            acceptAndBind();
            return;
          }

          if (inviteJoinIntentActive && hasPendingInviteNotification) {
            (async () => {
              try {
                let resolvedId = notifyCallId;
                let confName = inviteNotify?.conferenceName || null;
                if (sid && (!Number.isInteger(resolvedId) || resolvedId <= 0)) {
                  const res = await fetch(
                    `/api/calls/invite-context?callSid=${encodeURIComponent(sid)}`,
                    { credentials: "include" },
                  );
                  const json = await res.json().catch(() => ({}));
                  resolvedId = Number(json?.callId);
                  if (!confName && json?.conferenceName) confName = String(json.conferenceName);
                }
                if (!Number.isInteger(resolvedId) || resolvedId <= 0) {
                  try {
                    call.reject();
                  } catch {
                    /* ignore */
                  }
                  setSdkError("Could not resolve this invite call. It may have ended.");
                  return;
                }
                if (!sessionSyncRef.current) {
                  beginSession({
                    callId: resolvedId,
                    callOwnedByMe: false,
                    conferenceName: confName || inviteNotify?.conferenceName || null,
                    inviteCallSid: sid || null,
                    customerName,
                    phoneLabel: fromParam,
                    toNumber: fromParam,
                  });
                }
                acceptAndBind();
              } catch (err) {
                try {
                  call.reject();
                } catch {
                  /* ignore */
                }
                setSdkError(err?.message || "Unable to accept invite call");
              }
            })();
            return;
          }

          if (outboundExpectActive) {
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
                setSdkError("Outbound leg arrived before the session was ready. Try again.");
                return;
              }
              window.setTimeout(tick, 25);
            };
            window.setTimeout(tick, 0);
            return;
          }

          if (sid) {
            (async () => {
              try {
                const res = await fetch(`/api/calls/invite-context?callSid=${encodeURIComponent(sid)}`, {
                  credentials: "include",
                });
                const json = await res.json().catch(() => ({}));
                const resolvedId = Number(json?.callId);
                if (!Number.isInteger(resolvedId) || resolvedId <= 0) {
                  try {
                    call.reject();
                  } catch {
                    /* ignore */
                  }
                  return;
                }
                if (!sessionSyncRef.current) {
                  beginSession({
                    callId: resolvedId,
                    callOwnedByMe: false,
                    conferenceName: json?.conferenceName || null,
                    inviteCallSid: sid,
                    customerName,
                    phoneLabel: fromParam,
                    toNumber: fromParam,
                  });
                }
                acceptAndBind();
              } catch {
                try {
                  call.reject();
                } catch {
                  /* ignore */
                }
              }
            })();
            return;
          }

          try {
            call.reject();
          } catch {
            /* ignore */
          }
          return;
        }

        incomingCallRef.current = call;
        const from = String(call?.parameters?.From || "").trim();
        const baseInvite = {
          from: from || "Conference invite",
          callSid: getIncomingCallSid(call) || null,
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
  }, [registered, sessionSyncRef, beginSession, bindActiveCallEvents, destroyDevice, isFatalDeviceError]);

  // Single-active-tab lock (localStorage-backed).
  //
  // Design:
  //   * localStorage["dialer:tabLock"] = JSON.stringify({ tabId, ts })
  //   * The primary tab rewrites this every {@link TAB_LOCK_HEARTBEAT_MS}.
  //   * Secondary tabs read every {@link TAB_LOCK_STALE_CHECK_MS} and claim
  //     the lock if it's older than {@link TAB_LOCK_TTL_MS} (i.e. the primary
  //     tab crashed or was force-killed and never released the lock).
  //   * The `storage` event lets a secondary tab react instantly when the
  //     primary releases the lock cleanly on beforeunload.
  //
  // Why localStorage instead of BroadcastChannel: localStorage survives a tab
  // crash, so a newly opened tab can tell *whether* an older lock is fresh
  // (someone else is alive) vs stale (claim it). BroadcastChannel only relays
  // live messages — it can't answer "is anyone there right now?" reliably.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!tabIdRef.current) {
      tabIdRef.current =
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    const TAB = tabIdRef.current;

    function readLock() {
      try {
        const raw = window.localStorage.getItem(TAB_LOCK_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.tabId || typeof parsed.ts !== "number") return null;
        return parsed;
      } catch {
        return null;
      }
    }
    function isStale(lock) {
      return !lock || Date.now() - lock.ts >= TAB_LOCK_TTL_MS;
    }
    function writeLock() {
      try {
        window.localStorage.setItem(
          TAB_LOCK_KEY,
          JSON.stringify({ tabId: TAB, ts: Date.now() }),
        );
      } catch {
        /* storage quota / private mode — silently fall back to permissive mode */
      }
    }
    function releaseLockIfMine() {
      try {
        const lock = readLock();
        if (lock?.tabId === TAB) window.localStorage.removeItem(TAB_LOCK_KEY);
      } catch {
        /* ignore */
      }
    }
    function becomePrimary() {
      writeLock();
      isPrimaryTabRef.current = true;
      setIsPrimaryTab(true);
    }
    function becomeSecondary() {
      isPrimaryTabRef.current = false;
      setIsPrimaryTab(false);
    }
    function tryAcquire() {
      const lock = readLock();
      if (!lock || lock.tabId === TAB || isStale(lock)) {
        becomePrimary();
      } else {
        becomeSecondary();
      }
    }

    tryAcquire();

    const heartbeatHandle = window.setInterval(() => {
      if (isPrimaryTabRef.current) writeLock();
    }, TAB_LOCK_HEARTBEAT_MS);

    const staleCheckHandle = window.setInterval(() => {
      if (isPrimaryTabRef.current) return;
      const lock = readLock();
      if (isStale(lock)) tryAcquire();
    }, TAB_LOCK_STALE_CHECK_MS);

    function onStorage(e) {
      if (e.key !== TAB_LOCK_KEY) return;
      if (e.newValue == null) {
        tryAcquire();
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.tabId === TAB) {
          isPrimaryTabRef.current = true;
          setIsPrimaryTab(true);
        } else {
          // Another tab is now primary — stand down.
          isPrimaryTabRef.current = false;
          setIsPrimaryTab(false);
        }
      } catch {
        tryAcquire();
      }
    }

    function onBeforeUnload() {
      releaseLockIfMine();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("auth:logout", onBeforeUnload);

    return () => {
      window.clearInterval(heartbeatHandle);
      window.clearInterval(staleCheckHandle);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("auth:logout", onBeforeUnload);
      releaseLockIfMine();
    };
  }, []);

  // Warm-register the Twilio Device once we're the primary tab. If this tab
  // later loses the lock (another tab took over), destroy the Device so it
  // can't receive or place calls.
  useEffect(() => {
    if (isPrimaryTab === null) return; // lock state not yet read
    if (isPrimaryTab === false) {
      if (deviceRef.current) destroyDevice();
      attemptedWarmRegistrationRef.current = false;
      return;
    }
    if (attemptedWarmRegistrationRef.current && registered) return;
    attemptedWarmRegistrationRef.current = true;
    ensureRegistered().catch(() => {});
  }, [isPrimaryTab, ensureRegistered, destroyDevice, registered]);

  // Explicit takeover: a secondary tab can grab the lock and become primary.
  // Wired to the "Use this tab" button in VoiceLockBanner / call buttons.
  const takeOverDialer = useCallback(() => {
    if (typeof window === "undefined") return;
    const TAB = tabIdRef.current;
    if (!TAB) return;
    try {
      window.localStorage.setItem(
        TAB_LOCK_KEY,
        JSON.stringify({ tabId: TAB, ts: Date.now() }),
      );
    } catch {
      /* ignore — fall through and update local state anyway */
    }
    isPrimaryTabRef.current = true;
    setIsPrimaryTab(true);
  }, []);

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
    const pending = Boolean(incomingInvite || inviteNotification);
    pendingInviteRingRef.current = pending;
    if (!pending) {
      stopInviteTone();
      return;
    }
    if (audioUnlockedRef.current) startInviteTone();
  }, [incomingInvite, inviteNotification, startInviteTone, stopInviteTone]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onAudioUnlock() {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;
      if (pendingInviteRingRef.current) startInviteTone();
    }
    window.addEventListener("pointerdown", onAudioUnlock, { passive: true });
    window.addEventListener("keydown", onAudioUnlock);
    return () => {
      window.removeEventListener("pointerdown", onAudioUnlock);
      window.removeEventListener("keydown", onAudioUnlock);
    };
  }, [startInviteTone]);

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

    /** Real unload only — not pagehide (pagehide pairs with pageshow for refresh, same as visibility). */
    function onBeforeUnload() {
      endOwnedCallOnUnload();
      destroyDevice();
    }

    function onPageHide() {
      endOwnedCallOnUnload();
    }

    window.addEventListener("auth:logout", onLogout);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("auth:logout", onLogout);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [destroyDevice, endOwnedCallOnUnload]);

  const isOnActiveCall = useCallback(() => {
    return Boolean(callRef.current || sessionSyncRef.current);
  }, [sessionSyncRef]);

  // Tab: when visible again, refresh registration unless agent is on an active call (avoid tearing Twilio).
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (isOnActiveCall()) return;
      ensureRegistered().catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ensureRegistered, isOnActiveCall]);

  // Page lifecycle: refresh like visibility; never destroy during bfcache restore while on a call.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onPageShow(ev) {
      const live = isOnActiveCall();
      if (ev.persisted && !live) {
        destroyDevice();
      }
      if (live) return;
      ensureRegistered().catch(() => {});
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [destroyDevice, ensureRegistered, isOnActiveCall]);

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

  const acceptIncomingInvite = useCallback(async () => {
    const call = incomingCallRef.current;
    if (!call) return false;

    const snapshotInvite = incomingInvite;
    const snapshotNotify = inviteNotification;
    let callId = Number(snapshotInvite?.callId ?? snapshotNotify?.callId);
    const inviteCallSid = String(snapshotInvite?.callSid || "").trim() || null;

    if (!Number.isInteger(callId) || callId <= 0) {
      if (inviteCallSid) {
        try {
          const res = await fetch(
            `/api/calls/invite-context?callSid=${encodeURIComponent(inviteCallSid)}`,
            { credentials: "include" },
          );
          const json = await res.json().catch(() => ({}));
          callId = Number(json?.callId);
        } catch {
          callId = NaN;
        }
      }
    }

    if (!Number.isInteger(callId) || callId <= 0) {
      setSdkError("Could not resolve this call. It may have ended — ask the host to send a new invite.");
      return false;
    }

    setSdkError(null);
    setIncomingInvite(null);
    stopInviteTone();

    try {
      if (!sessionSyncRef.current) {
        beginSession({
          callId,
          callOwnedByMe: false,
          conferenceName: snapshotInvite?.conferenceName || snapshotNotify?.conferenceName || null,
          inviteCallSid,
          customerName: snapshotInvite?.customerName?.trim() || "Customer",
          phoneLabel: call?.parameters?.From || "",
          toNumber: call?.parameters?.From || "",
        });
      }
      call.accept();
      incomingCallRef.current = null;
      bindActiveCallEvents(call);
      return true;
    } catch (err) {
      setSdkError(err?.message || "Unable to join incoming call");
      return false;
    }
  }, [incomingInvite, inviteNotification, beginSession, bindActiveCallEvents, stopInviteTone, sessionSyncRef]);

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

  const leaveConference = useCallback(async () => {
    const snap = sessionSyncRef.current;
    const active = callRef.current;
    const isInvitee = snap?.callOwnedByMe === false;

    const isDirectCall =
      snap?.callOwnedByMe !== false &&
      snap?.callMode !== "conference" &&
      !snap?.conferenceName;

    // Direct 1:1 (Dial bridge): always end the full call, not a partial leave.
    if (!isInvitee && isDirectCall) {
      await endCall();
      if (callRef.current) {
        leaveWithoutEndingRef.current = false;
        try {
          callRef.current.disconnect();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    // Invited agent leaves: disconnect only their browser leg.
    // Calling `/api/calls/end` here would tear down owner + customer while other agents may still be in the room.
    // `/api/twilio/conference-status` ends PSTN/parent when no Voice (`client:`) agents remain — same model as owner leave.
    if (isInvitee) {
      if (active) {
        try {
          active.disconnect();
        } catch {
          clearLocalSession();
        }
      } else {
        clearLocalSession();
      }
      return;
    }

    if (active) {
      leaveWithoutEndingRef.current = true;
      leftConferenceWithoutEndingRef.current = true;
      ownerCallIdRef.current = null;
      try {
        active.disconnect();
      } catch {
        leaveWithoutEndingRef.current = false;
        clearLocalSession();
      }
    } else {
      clearLocalSession();
    }
  }, [clearLocalSession, endCall]);

  return (
    <TwilioVoiceContext.Provider
      value={{
        muted,
        sdkError,
        sdkInitializing,
        registered,
        voiceConnected,
        voiceDisplaced,
        isPrimaryTab,
        takeOverDialer,
        toggleMute,
        sendDtmf,
        ensureRegistered,
        leaveConference,
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
