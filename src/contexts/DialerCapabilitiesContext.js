"use client";

import { createContext, useContext } from "react";

const DialerCapabilitiesContext = createContext({ canUseDialer2: false });

export function DialerCapabilitiesProvider({ canUseDialer2 = false, children }) {
  return (
    <DialerCapabilitiesContext.Provider value={{ canUseDialer2: Boolean(canUseDialer2) }}>
      {children}
    </DialerCapabilitiesContext.Provider>
  );
}

export function useDialerCapabilities() {
  return useContext(DialerCapabilitiesContext);
}
