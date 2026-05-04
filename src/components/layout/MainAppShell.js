"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function MainAppShell({ children }) {
  return (
    <ActiveCallProvider>
      <TwilioVoiceProvider>
        <ThemeProvider>
          {children}
          <GlobalWebCallInterface />
        </ThemeProvider>
      </TwilioVoiceProvider>
    </ActiveCallProvider>
  );
}
