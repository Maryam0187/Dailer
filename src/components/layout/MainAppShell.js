"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import { Line2CallProvider } from "@/contexts/Line2CallContext";
import { TwilioVoiceLine2Provider } from "@/contexts/TwilioVoiceLine2Context";
import { DialerCapabilitiesProvider } from "@/contexts/DialerCapabilitiesContext";
import { MessagingProvider } from "@/contexts/MessagingContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import Line2CallInterface from "@/components/Dialer/Line2CallInterface";
import MessagingSlideOver from "@/components/Messaging/MessagingSlideOver";
import IvrStaffAlert from "@/components/layout/IvrStaffAlert";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import ShiftLogoutGuard from "@/components/layout/ShiftLogoutGuard";
import ActivityTracker from "@/components/layout/ActivityTracker";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function MainAppShell({
  children,
  currentUserId = null,
  userRole = null,
  isOutside = false,
  canUseDialer2 = false,
}) {
  const outsideManager = userRole === "manager" && isOutside;

  return (
    <DialerCapabilitiesProvider canUseDialer2={canUseDialer2}>
      <ActiveCallProvider>
        <TwilioVoiceProvider>
          <Line2CallProvider>
            <TwilioVoiceLine2Provider>
              <MessagingProvider>
                <ThemeProvider>
                  {outsideManager ? null : <ActivityTracker />}
                  {outsideManager ? null : <ShiftLogoutGuard />}
                  {outsideManager ? null : <VoiceLockBanner />}
                  {children}
                  <MessagingSlideOver currentUserId={currentUserId} userRole={userRole} />
                  {outsideManager ? null : <IvrStaffAlert userRole={userRole} />}
                  <GlobalWebCallInterface />
                  <Line2CallInterface />
                </ThemeProvider>
              </MessagingProvider>
            </TwilioVoiceLine2Provider>
          </Line2CallProvider>
        </TwilioVoiceProvider>
      </ActiveCallProvider>
    </DialerCapabilitiesProvider>
  );
}
