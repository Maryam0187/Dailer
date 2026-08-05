"use client";

import DemoShell from "@/components/demo/DemoShell";
import DemoMessagesView from "@/components/demo/DemoMessagesView";

export default function DemoMessagesPage() {
  return (
    <DemoShell
      title="Messages"
      subtitle="Floor chat and DMs — switch identity on Team to see unread badges across seats."
    >
      <DemoMessagesView />
    </DemoShell>
  );
}
