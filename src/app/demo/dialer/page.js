"use client";

import DemoShell from "@/components/demo/DemoShell";
import DemoDialerView from "@/components/demo/DemoDialerView";

export default function DemoDialerPage() {
  return (
    <DemoShell
      title="Agent dialer"
      subtitle="Simulated browser softphone with mute, DTMF, recording, conference, and call history."
    >
      <DemoDialerView />
    </DemoShell>
  );
}
