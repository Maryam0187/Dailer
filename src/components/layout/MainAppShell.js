"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function MainAppShell({ children }) {
  return (
    <ActiveCallProvider>
      <TwilioVoiceProvider>
        <ThemeProvider>
          <VoiceLockBanner />
          {children}
          <GlobalWebCallInterface />
        </ThemeProvider>
      </TwilioVoiceProvider>
    </ActiveCallProvider>
  );
}
