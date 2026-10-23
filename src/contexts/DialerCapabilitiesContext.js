"use client";

import { createContext, useContext } from "react";
import { LINE2_DIALER_ENABLED } from "@/lib/line2DialerFlag";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";

const DialerCapabilitiesContext = createContext({
  canUseDialer2: false,
  canUseTwilioDialer: true,
  canUseZoomPhone: false,
});

export function DialerCapabilitiesProvider({
  canUseDialer2 = false,
  canUseTwilioDialer = true,
  canUseZoomPhone = false,
  children,
}) {
  // While LINE2_DIALER_ENABLED is false, hide Line 2 UI and skip Line 2 Voice register.
  const line2Enabled = LINE2_DIALER_ENABLED && Boolean(canUseDialer2);
  const twilioEnabled = canUseTwilioDialer !== false;
  const zoomEnabled = ZOOM_SMART_EMBED_ENABLED && Boolean(canUseZoomPhone);

  return (
    <DialerCapabilitiesContext.Provider
      value={{
        canUseDialer2: line2Enabled,
        canUseTwilioDialer: twilioEnabled,
        canUseZoomPhone: zoomEnabled,
      }}
    >
      {children}
    </DialerCapabilitiesContext.Provider>
  );
}

export function useDialerCapabilities() {
  return useContext(DialerCapabilitiesContext);
}
