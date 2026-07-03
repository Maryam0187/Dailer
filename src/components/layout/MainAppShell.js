"use client";

import { useEffect } from "react";
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { stashSignInNotice } from "@/lib/signInNotice";

/**
 * When an API returns 401, resolve the real logout reason (shift ended vs another
 * device, etc.) instead of assuming every unauthorized response is a replacement.
 */
function AuthExpiryWatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let redirecting = false;

    async function redirectForAuthExpiry() {
      if (redirecting || window.location.pathname.startsWith("/sign-in")) return;
      if (window.location.pathname.startsWith("/leave-application")) return;
      redirecting = true;
      try {
        const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (json?.ok) {
          redirecting = false;
          return;
        }
        const reason = json?.reason || null;
        if (reason && reason !== "shift_ended") stashSignInNotice(reason);
        window.location.href = "/sign-in";
      } catch {
        window.location.href = "/sign-in";
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

    return () => {
      window.fetch = orig;
    };
  }, []);

  return null;
}

export default function MainAppShell({ children }) {
  return (
    <ActiveCallProvider>
      <TwilioVoiceProvider>
        <ThemeProvider>
          <AuthExpiryWatcher />
          <VoiceLockBanner />
          {children}
          <GlobalWebCallInterface />
        </ThemeProvider>
      </TwilioVoiceProvider>
    </ActiveCallProvider>
  );
}
