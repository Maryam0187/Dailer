"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioVoiceProvider } from "@/contexts/TwilioVoiceContext";
import { Line2CallProvider } from "@/contexts/Line2CallContext";
import { TwilioVoiceLine2Provider } from "@/contexts/TwilioVoiceLine2Context";
import { DialerCapabilitiesProvider, useDialerCapabilities } from "@/contexts/DialerCapabilitiesContext";
import { ZoomSmartEmbedProvider } from "@/contexts/ZoomSmartEmbedContext";
import { MessagingProvider } from "@/contexts/MessagingContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import Line2CallInterface from "@/components/Dialer/Line2CallInterface";
import ZoomSmartEmbed from "@/components/Dialer/ZoomSmartEmbed";
import MessagingSlideOver from "@/components/Messaging/MessagingSlideOver";
import IvrStaffAlert from "@/components/layout/IvrStaffAlert";
import VoiceLockBanner from "@/components/layout/VoiceLockBanner";
import ShiftLogoutGuard from "@/components/layout/ShiftLogoutGuard";
import ActivityTracker from "@/components/layout/ActivityTracker";
import OneSignalProvider from "@/components/push/OneSignalProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

function VoiceProviderChrome({ userRole = null, outsideManager = false }) {
  const { canUseTwilioDialer, canUseZoomPhone } = useDialerCapabilities();

  return (
    <>
      {!outsideManager && canUseTwilioDialer ? <VoiceLockBanner /> : null}
      {!outsideManager ? <IvrStaffAlert userRole={userRole} /> : null}
      {canUseTwilioDialer ? <GlobalWebCallInterface userRole={userRole} /> : null}
      {canUseTwilioDialer ? <Line2CallInterface /> : null}
      {canUseZoomPhone ? <ZoomSmartEmbed /> : null}
    </>
  );
}

export default function MainAppShell({
  children,
  currentUserId = null,
  currentUsername = null,
  userRole = null,
  isOutside = false,
  canUseDialer2 = false,
  canUseTwilioDialer = true,
  canUseZoomPhone = false,
}) {
  const outsideManager = userRole === "manager" && isOutside;

  return (
    <DialerCapabilitiesProvider
      canUseDialer2={canUseDialer2}
      canUseTwilioDialer={canUseTwilioDialer}
      canUseZoomPhone={canUseZoomPhone}
    >
      <ActiveCallProvider>
        <TwilioVoiceProvider userRole={userRole}>
          <Line2CallProvider>
            <TwilioVoiceLine2Provider>
              <ZoomSmartEmbedProvider>
                <MessagingProvider>
                  <ThemeProvider>
                    <OneSignalProvider userId={currentUserId} username={currentUsername} />
                    {outsideManager ? null : <ActivityTracker />}
                    {outsideManager ? null : <ShiftLogoutGuard />}
                    {children}
                    <MessagingSlideOver currentUserId={currentUserId} userRole={userRole} />
                    <VoiceProviderChrome userRole={userRole} outsideManager={outsideManager} />
                  </ThemeProvider>
                </MessagingProvider>
              </ZoomSmartEmbedProvider>
            </TwilioVoiceLine2Provider>
          </Line2CallProvider>
        </TwilioVoiceProvider>
      </ActiveCallProvider>
    </DialerCapabilitiesProvider>
  );
}
