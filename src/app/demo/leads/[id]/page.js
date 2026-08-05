"use client";

import { useParams } from "next/navigation";
import DemoShell from "@/components/demo/DemoShell";
import DemoLeadDetailView from "@/components/demo/DemoLeadDetailView";

export default function DemoLeadDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");

  return (
    <DemoShell
      title="Lead detail"
      subtitle="Advance the workflow, set payment method, edit notes, or dial from the card."
    >
      <DemoLeadDetailView leadId={id} />
    </DemoShell>
  );
}
