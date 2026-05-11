"use client";

import { useEffect } from "react";
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

/**
 * If a newer login on another device/browser rotated this user's sid, any API
 * call from this stale tab returns 401. Bounce to /sign-in so the user lands
 * on a clear "your session ended elsewhere" page instead of a half-broken UI.
 */
function AuthExpiryWatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await orig(...args);
      if (res.status === 401 && !window.location.pathname.startsWith("/sign-in")) {
        window.location.href = "/sign-in?reason=replaced";
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
