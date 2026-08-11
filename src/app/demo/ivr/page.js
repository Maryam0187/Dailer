"use client";

import DemoShell from "@/components/demo/DemoShell";
import DemoIvrView from "@/components/demo/DemoIvrView";

export default function DemoIvrPage() {
  return (
    <DemoShell
      title="Inbound IVR"
      subtitle="Staff alerts, menu gather, ring-to-admin, and answer — the inbound path without Twilio."
    >
      <DemoIvrView />
    </DemoShell>
  );
}
