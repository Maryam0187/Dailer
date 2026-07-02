"use client";

import { useEffect } from "react";
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const REDIRECT_REASONS = new Set(["replaced", "shift_ended", "session_day_ended"]);

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
      redirecting = true;
      try {
        const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (json?.ok) {
          redirecting = false;
          return;
        }
        const reason = REDIRECT_REASONS.has(json?.reason) ? json.reason : null;
        window.location.href = reason ? `/sign-in?reason=${reason}` : "/sign-in";
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
