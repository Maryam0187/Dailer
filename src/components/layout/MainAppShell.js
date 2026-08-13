"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import { MessagingProvider } from "@/contexts/MessagingContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import MessagingSlideOver from "@/components/Messaging/MessagingSlideOver";
import IvrStaffAlert from "@/components/layout/IvrStaffAlert";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import ShiftLogoutGuard from "@/components/layout/ShiftLogoutGuard";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function MainAppShell({
  children,
  currentUserId = null,
  userRole = null,
  isOutside = false,
}) {
  const outsideManager = userRole === "manager" && isOutside;

  const inner = (
    <ThemeProvider>
      {outsideManager ? null : <ShiftLogoutGuard />}
      {outsideManager ? null : <VoiceLockBanner />}
      {children}
      {outsideManager ? null : (
        <MessagingSlideOver currentUserId={currentUserId} userRole={userRole} />
      )}
      {outsideManager ? null : <IvrStaffAlert userRole={userRole} />}
      {outsideManager ? null : <GlobalWebCallInterface />}
    </ThemeProvider>
  );

  if (outsideManager) {
    return <ActiveCallProvider>{inner}</ActiveCallProvider>;
  }

  return (
    <ActiveCallProvider>
      <TwilioVoiceProvider>
        <MessagingProvider>{inner}</MessagingProvider>
      </TwilioVoiceProvider>
    </ActiveCallProvider>
  );
}
