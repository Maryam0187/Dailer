"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ActiveCallContext = createContext(undefined);

export function ActiveCallProvider({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);

  const beginSession = useCallback((payload) => {
    setSession({
      ...payload,
      startedAt: Date.now(),
      phase: "connecting",
    });
  }, []);

  const endCall = useCallback(async () => {
    const current = session;
    if (current?.callId) {
      try {
        await fetch("/api/calls/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ callId: current.callId }),
        });
      } catch {
        // UI still ends the local session even if API fails.
      }
    }
    setSession(null);
    router.refresh();
  }, [router, session]);

  const markInProgress = useCallback(() => {
    setSession((s) => (s ? { ...s, phase: "in_progress" } : s));
  }, []);

  useEffect(() => {
    if (!session?.callId || session.phase !== "connecting") return;
    const t = setTimeout(() => {
      setSession((s) =>
        s && s.callId === session.callId ? { ...s, phase: "in_progress" } : s
      );
    }, 900);
    return () => clearTimeout(t);
  }, [session?.callId, session?.phase]);

  return (
    <ActiveCallContext.Provider value={{ session, beginSession, endCall, markInProgress }}>
      {children}
    </ActiveCallContext.Provider>
  );
}

export function useActiveCall() {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error("useActiveCall must be used within ActiveCallProvider");
  return ctx;
}
