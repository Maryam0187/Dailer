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

  const endCall = useCallback(() => {
    setSession(null);
    router.refresh();
  }, [router]);

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
    <ActiveCallContext.Provider value={{ session, beginSession, endCall }}>
      {children}
    </ActiveCallContext.Provider>
  );
}

export function useActiveCall() {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error("useActiveCall must be used within ActiveCallProvider");
  return ctx;
}
