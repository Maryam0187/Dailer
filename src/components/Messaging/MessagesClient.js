"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useMessaging } from "@/contexts/MessagingContext";
import MessagingPanel from "@/components/Messaging/MessagingPanel";

export default function MessagesClient({ currentUserId }) {
  const searchParams = useSearchParams();
  const { setActiveConversationId, setComposeRecipientId } = useMessaging();

  useEffect(() => {
    const raw = searchParams.get("c");
    const id = raw != null ? Number(raw) : null;
    if (Number.isInteger(id) && id > 0) {
      setActiveConversationId(id);
      setComposeRecipientId(null);
    }
  }, [searchParams, setActiveConversationId, setComposeRecipientId]);

  return (
    <MessagingPanel
      currentUserId={currentUserId}
      mode="page"
      className="shadow-sm"
    />
  );
}
