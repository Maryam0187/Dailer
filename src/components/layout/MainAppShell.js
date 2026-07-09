"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import { MessagingProvider } from "@/contexts/MessagingContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import MessagingSlideOver from "@/components/Messaging/MessagingSlideOver";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import ShiftLogoutGuard from "@/components/layout/ShiftLogoutGuard";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function MainAppShell({ children, currentUserId = null, userRole = null }) {
  return (
    <ActiveCallProvider>
      <TwilioVoiceProvider>
        <MessagingProvider>
          <ThemeProvider>
            <ShiftLogoutGuard />
            <VoiceLockBanner />
            {children}
            <MessagingSlideOver currentUserId={currentUserId} userRole={userRole} />
            <GlobalWebCallInterface />
          </ThemeProvider>
        </MessagingProvider>
      </TwilioVoiceProvider>
    </ActiveCallProvider>
  );
}
