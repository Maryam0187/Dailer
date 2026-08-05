"use client";

import DemoShell from "@/components/demo/DemoShell";
import DemoLeadsView from "@/components/demo/DemoLeadsView";

export default function DemoLeadsPage() {
  return (
    <DemoShell
      title="Leads"
      subtitle="Sales workflow — phases, progress tags, contact outcomes, and click-to-dial."
    >
      <DemoLeadsView />
    </DemoShell>
  );
}
