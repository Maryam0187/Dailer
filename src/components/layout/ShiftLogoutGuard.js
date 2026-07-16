"use client";

import { useEffect, useRef, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { stashSignInNotice } from "@/lib/signInNotice";

function isOnActiveCall(session) {
  return Boolean(session?.callId);
}

async function checkSession() {
  const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    // Network/proxy/5xx — do not treat as logged out (common after idle/sleep).
    return { ok: true, unreachable: true };
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return { ok: true, unreachable: true };
  }
  return json;
}

function redirectToSignIn(reason) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/sign-in")) return;
  if (reason && reason !== "shift_ended") stashSignInNotice(reason);
  window.location.href = "/sign-in";
}

/**
 * Defers shift-ended sign-out while the agent is on an active call.
 * After the call ends, completes the pending shift logout.
 */
export default function ShiftLogoutGuard() {
  const { session } = useActiveCall();
  const sessionRef = useRef(session);
  const redirectingRef = useRef(false);
  const [pendingShiftLogout, setPendingShiftLogout] = useState(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    async function completePendingLogout() {
      if (!pendingShiftLogout || isOnActiveCall(session)) return;
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      try {
        const json = await checkSession();
        if (json?.unreachable) {
          redirectingRef.current = false;
          return;
        }
        if (json?.ok === false) {
          redirectToSignIn(json?.reason || "shift_ended");
          return;
        }
        setPendingShiftLogout(false);
        redirectingRef.current = false;
      } catch {
        redirectingRef.current = false;
      }
    }

    void completePendingLogout();
  }, [pendingShiftLogout, session]);

  useEffect(() => {
    function onCallEnded() {
      if (!pendingShiftLogout) return;
      void (async () => {
        const json = await checkSession();
        if (json?.unreachable) return;
        if (json?.ok === false) {
          redirectToSignIn(json?.reason || "shift_ended");
        } else {
          setPendingShiftLogout(false);
        }
      })();
    }

    window.addEventListener("call-ended", onCallEnded);
    return () => window.removeEventListener("call-ended", onCallEnded);
  }, [pendingShiftLogout]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    async function handleAuthFailure(reason) {
      if (redirectingRef.current || window.location.pathname.startsWith("/sign-in")) return;
      if (window.location.pathname.startsWith("/leave-application")) return;

      if (reason === "shift_ended" && isOnActiveCall(sessionRef.current)) {
        setPendingShiftLogout(true);
        return;
      }

      redirectingRef.current = true;
      redirectToSignIn(reason);
    }

    async function redirectForAuthExpiry() {
      try {
        const json = await checkSession();
        // Only sign out when the server explicitly rejects the session.
        // Idle tabs, laptop sleep, and transient errors used to look like "inactivity logout".
        if (json?.ok === false) {
          await handleAuthFailure(json?.reason || null);
        }
      } catch {
        /* ignore network errors — keep the session */
      }
    }

    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await orig(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (
        res.status === 401 &&
        !window.location.pathname.startsWith("/sign-in") &&
        !window.location.pathname.startsWith("/leave-application") &&
        !url.includes("/api/auth/signin") &&
        !url.includes("/api/auth/session")
      ) {
        void redirectForAuthExpiry();
      }
      return res;
    };

    const interval = window.setInterval(() => {
      void redirectForAuthExpiry();
    }, 30_000);

    return () => {
      window.fetch = orig;
      window.clearInterval(interval);
    };
  }, []);

  if (!pendingShiftLogout || !isOnActiveCall(session)) return null;

  return (
    <div className="border-b border-sky-300 bg-sky-50 px-4 py-2 text-center text-sm font-medium text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      Shift has ended. You will be signed out when your call ends. Please save files and leads after the call.
    </div>
  );
}
