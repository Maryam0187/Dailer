"use client";

import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import GlobalWebCallInterface from "@/components/Dialer/GlobalWebCallInterface";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function MainAppShell({ children }) {
  return (
    <ActiveCallProvider>
      <ThemeProvider>
        {children}
        <GlobalWebCallInterface />
      </ThemeProvider>
    </ActiveCallProvider>
  );
}
