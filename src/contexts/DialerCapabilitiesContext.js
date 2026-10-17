"use client";

import { createContext, useContext } from "react";
import { LINE2_DIALER_ENABLED } from "@/lib/line2DialerFlag";

const DialerCapabilitiesContext = createContext({ canUseDialer2: false });

export function DialerCapabilitiesProvider({ canUseDialer2 = false, children }) {
  // While LINE2_DIALER_ENABLED is false, hide Line 2 UI and skip Line 2 Voice register.
  const enabled = LINE2_DIALER_ENABLED && Boolean(canUseDialer2);
  return (
    <DialerCapabilitiesContext.Provider value={{ canUseDialer2: enabled }}>
      {children}
    </DialerCapabilitiesContext.Provider>
  );
}

export function useDialerCapabilities() {
  return useContext(DialerCapabilitiesContext);
}
