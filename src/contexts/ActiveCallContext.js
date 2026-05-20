"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ActiveCallContext = createContext(undefined);

export function ActiveCallProvider({ children }) {
  const [session, setSession] = useState(null);
  /** Same shape as session; updated synchronously so Twilio incoming handlers avoid stale React state. */
  const sessionSyncRef = useRef(null);

  const beginSession = useCallback((payload) => {
    const next = {
      ...payload,
      startedAt: Date.now(),
      phase: "connecting",
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
        // UI still ends the local session even if API fails.
      }
    }
    sessionSyncRef.current = null;
    setSession(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("call-ended", {
          detail: {
            callId: current?.callId || null,
            callKind: current?.callKind || null,
            toNumber: current?.toNumber || null,
            phoneLabel: current?.phoneLabel || null,
            customerName: current?.customerName || null,
            city: current?.city || null,
            state: current?.state || null,
            zipCode: current?.zipCode || null,
          },
        }),
      );
    }
  }, [session]);

  /** Drop local UI/session without telling the server to tear down the conference (participant leave). */
  const clearLocalSession = useCallback(() => {
    sessionSyncRef.current = null;
    setSession(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("call-ended", { detail: { reason: "leave", localOnly: true } }),
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
    <ActiveCallContext.Provider
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
    </ActiveCallContext.Provider>
  );
}

export function useActiveCall() {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error("useActiveCall must be used within ActiveCallProvider");
  return ctx;
}
