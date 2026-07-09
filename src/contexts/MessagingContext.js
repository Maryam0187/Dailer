"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { io as ioClient } from "socket.io-client";
import { playIncomingMessageSound, unlockMessageSound } from "@/lib/messageSound";

const MessagingContext = createContext(undefined);

function upsertConversation(list, conversation) {
  const without = list.filter((c) => Number(c.id) !== Number(conversation.id));
  return [conversation, ...without].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
}

function sumUnread(conversations) {
  return conversations.reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0);
}

function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
}

function applyPresenceToConversation(conversation, userId, presence, lastActiveAt) {
  let changed = false;
  let peer = conversation.peer;
  if (peer && Number(peer.id) === userId) {
    peer = {
      ...peer,
      presence,
      lastActiveAt: lastActiveAt ?? peer.lastActiveAt ?? null,
    };
    changed = true;
  }

  let participants = conversation.participants;
  if (Array.isArray(participants)) {
    const nextParticipants = participants.map((p) => {
      if (!p || Number(p.id) !== userId) return p;
      changed = true;
      return {
        ...p,
        presence,
        lastActiveAt: lastActiveAt ?? p.lastActiveAt ?? null,
      };
    });
    if (changed) participants = nextParticipants;
  }

  if (!changed) return conversation;
  return { ...conversation, peer, participants };
}

export function MessagingProvider({ children }) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [composeRecipientId, setComposeRecipientId] = useState(null);
  const activeConversationIdRef = useRef(null);
  const inboxOpenRef = useRef(false);
  const onMessagesPageRef = useRef(false);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    inboxOpenRef.current = inboxOpen;
  }, [inboxOpen]);

  useEffect(() => {
    onMessagesPageRef.current = pathname === "/messages";
  }, [pathname]);

  const refreshInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
      setTotalUnread(Number(data.totalUnread) || 0);
    } catch {
      /* ignore network errors */
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  // Browsers block audio until a user gesture — unlock on first interaction.
  useEffect(() => {
    function unlock() {
      void unlockMessageSound();
    }
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("message:new", (payload) => {
      const conversationId = Number(payload?.conversationId);
      const message = payload?.message;
      const isSelf = Boolean(payload?.self);
      if (!Number.isInteger(conversationId) || conversationId <= 0 || !message) return;

      window.dispatchEvent(
        new CustomEvent("dialer:message:new", {
          detail: { conversationId, message, self: isSelf },
        }),
      );

      // Only "focused" when the user can actually see the thread right now
      // (slide-over open, or full /messages page). A stale activeConversationId
      // after closing the inbox must not suppress the unread badge.
      const viewingThread =
        Number(activeConversationIdRef.current) === conversationId &&
        (inboxOpenRef.current || onMessagesPageRef.current);

      if (!isSelf) {
        playIncomingMessageSound();
      }

      setConversations((prev) => {
        const existing = prev.find((c) => Number(c.id) === conversationId);
        if (!existing) {
          refreshInbox();
          return prev;
        }

        const unreadBump = !isSelf && !viewingThread ? 1 : 0;
        const next = upsertConversation(prev, {
          ...existing,
          lastMessageAt: message.createdAt,
          lastMessage: message,
          unreadCount: viewingThread
            ? 0
            : (Number(existing.unreadCount) || 0) + unreadBump,
        });
        setTotalUnread(sumUnread(next));
        return next;
      });

      if (viewingThread && !isSelf) {
        fetch(`/api/messages/conversations/${conversationId}/read`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }
    });

    // Same presence:update stream as the Users table (admin/manager/supervisor
    // sockets join presence:observers on connect).
    socket.on("presence:update", (payload) => {
      const userId = Number(payload?.userId);
      if (!Number.isInteger(userId) || userId <= 0) return;
      const presence = normalizePresence(payload?.presence);
      const lastActiveAt = payload?.lastActiveAt ?? null;

      window.dispatchEvent(
        new CustomEvent("dialer:presence:update", {
          detail: { userId, presence, lastActiveAt },
        }),
      );

      setConversations((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          const updated = applyPresenceToConversation(c, userId, presence, lastActiveAt);
          if (updated !== c) changed = true;
          return updated;
        });
        return changed ? next : prev;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [refreshInbox]);

  const openInbox = useCallback((conversationId = null) => {
    setInboxOpen(true);
    if (conversationId != null) {
      setActiveConversationId(Number(conversationId));
      setComposeRecipientId(null);
    }
  }, []);

  const closeInbox = useCallback(() => {
    setInboxOpen(false);
    // Clear selection so later realtime messages still bump the badge
    setActiveConversationId(null);
    setComposeRecipientId(null);
  }, []);

  const openConversation = useCallback((conversationId) => {
    setActiveConversationId(Number(conversationId));
    setComposeRecipientId(null);
    setInboxOpen(true);
  }, []);

  const startCompose = useCallback((recipientUserId = null) => {
    setActiveConversationId(null);
    setComposeRecipientId(recipientUserId != null ? Number(recipientUserId) : null);
    setInboxOpen(true);
  }, []);

  const markLocalRead = useCallback((conversationId) => {
    const id = Number(conversationId);
    setConversations((prev) => {
      const next = prev.map((c) =>
        Number(c.id) === id ? { ...c, unreadCount: 0 } : c,
      );
      setTotalUnread(sumUnread(next));
      return next;
    });
  }, []);

  const mergeConversation = useCallback((conversation) => {
    if (!conversation?.id) return;
    setConversations((prev) => {
      const existing = prev.find((c) => Number(c.id) === Number(conversation.id));
      const merged = existing
        ? { ...existing, ...conversation, unreadCount: existing.unreadCount ?? 0 }
        : { ...conversation, unreadCount: conversation.unreadCount ?? 0 };
      const next = upsertConversation(prev, merged);
      setTotalUnread(sumUnread(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      totalUnread,
      loadingInbox,
      inboxOpen,
      activeConversationId,
      composeRecipientId,
      refreshInbox,
      openInbox,
      closeInbox,
      openConversation,
      startCompose,
      setActiveConversationId,
      setComposeRecipientId,
      markLocalRead,
      mergeConversation,
    }),
    [
      conversations,
      totalUnread,
      loadingInbox,
      inboxOpen,
      activeConversationId,
      composeRecipientId,
      refreshInbox,
      openInbox,
      closeInbox,
      openConversation,
      startCompose,
      markLocalRead,
      mergeConversation,
    ],
  );

  return (
    <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
  );
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) {
    throw new Error("useMessaging must be used within MessagingProvider");
  }
  return ctx;
}
