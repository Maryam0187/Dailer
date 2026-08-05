"use client";

import DemoShell from "@/components/demo/DemoShell";
import DemoTeamView from "@/components/demo/DemoTeamView";

export default function DemoTeamPage() {
  return (
    <DemoShell
      title="Team"
      subtitle="Roles, presence, and today’s dialer metrics for the sales floor."
    >
      <DemoTeamView />
    </DemoShell>
  );
}
