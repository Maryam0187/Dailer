"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const Line2CallContext = createContext(undefined);

export function Line2CallProvider({ children }) {
  const [session, setSession] = useState(null);
  const sessionSyncRef = useRef(null);

  const beginSession = useCallback((payload) => {
    const next = {
      ...payload,
      startedAt: Date.now(),
      phase: "connecting",
      dialerIndex: 2,
    };
    sessionSyncRef.current = next;
    setSession(next);
  }, []);

  const endCall = useCallback(async () => {
    const current = session;
    const callIdNum = Number(current?.callId);
    if (Number.isInteger(callIdNum) && callIdNum > 0) {
      try {
        await fetch("/api/calls/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ callId: callIdNum }),
        });
      } catch {
        /* UI still ends the local session even if API fails. */
      }
    }
    sessionSyncRef.current = null;
    setSession(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("call-ended", { detail: { callId: current?.callId || null, dialerIndex: 2 } }));
    }
  }, [session]);

  const clearLocalSession = useCallback(() => {
    sessionSyncRef.current = null;
    setSession(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("call-ended", { detail: { reason: "leave", localOnly: true, dialerIndex: 2 } }),
      );
    }
  }, []);

  const markInProgress = useCallback(() => {
    setSession((s) => {
      if (!s) return s;
      const next = { ...s, phase: "in_progress" };
      sessionSyncRef.current = next;
      return next;
    });
  }, []);

  const patchSession = useCallback((patch) => {
    setSession((current) => {
      if (!current) return current;
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      if (!nextPatch || typeof nextPatch !== "object") return current;
      const next = { ...current, ...nextPatch };
      sessionSyncRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!session?.callId || session.phase !== "connecting") return;
    const t = setTimeout(() => {
      setSession((s) => {
        if (!s || s.callId !== session.callId) return s;
        const next = { ...s, phase: "in_progress" };
        sessionSyncRef.current = next;
        return next;
      });
    }, 900);
    return () => clearTimeout(t);
  }, [session?.callId, session?.phase]);

  return (
    <Line2CallContext.Provider
      value={{
        session,
        sessionSyncRef,
        beginSession,
        patchSession,
        endCall,
        clearLocalSession,
        markInProgress,
      }}
    >
      {children}
    </Line2CallContext.Provider>
  );
}

export function useLine2Call() {
  const ctx = useContext(Line2CallContext);
  if (!ctx) throw new Error("useLine2Call must be used within Line2CallProvider");
  return ctx;
}
