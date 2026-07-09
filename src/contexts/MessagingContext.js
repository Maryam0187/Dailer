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

const LAST_CONVERSATION_KEY = "dialer:messages:lastConversationId";
const DRAFT_KEY_PREFIX = "dialer:messages:draft:";

function readStoredConversationId() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_CONVERSATION_KEY);
    const id = raw != null ? Number(raw) : null;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeStoredConversationId(conversationId) {
  if (typeof window === "undefined") return;
  try {
    if (conversationId == null) {
      window.sessionStorage.removeItem(LAST_CONVERSATION_KEY);
    } else {
      window.sessionStorage.setItem(LAST_CONVERSATION_KEY, String(conversationId));
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function readMessageDraft(conversationId) {
  if (typeof window === "undefined" || conversationId == null) return "";
  try {
    return window.sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${conversationId}`) || "";
  } catch {
    return "";
  }
}

export function writeMessageDraft(conversationId, text) {
  if (typeof window === "undefined" || conversationId == null) return;
  try {
    const key = `${DRAFT_KEY_PREFIX}${conversationId}`;
    if (!text) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, text);
  } catch {
    /* ignore */
  }
}

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
  const [activeConversationId, setActiveConversationIdState] = useState(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [composeRecipientId, setComposeRecipientId] = useState(null);
  const [restoredSession, setRestoredSession] = useState(false);
  const activeConversationIdRef = useRef(null);
  const inboxOpenRef = useRef(false);
  const onMessagesPageRef = useRef(false);

  const setActiveConversationId = useCallback((id) => {
    const next = id == null ? null : Number(id);
    const value = Number.isInteger(next) && next > 0 ? next : null;
    setActiveConversationIdState(value);
    writeStoredConversationId(value);
  }, []);

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
      const list = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(list);
      setTotalUnread(Number(data.totalUnread) || 0);
      return list;
    } catch {
      return null;
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  // Restore last open chat after inbox loads (and on /messages)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshInbox();
      if (cancelled) return;
      const stored = readStoredConversationId();
      if (stored && Array.isArray(list) && list.some((c) => Number(c.id) === stored)) {
        setActiveConversationIdState(stored);
        activeConversationIdRef.current = stored;
      }
      setRestoredSession(true);
    })();
    return () => {
      cancelled = true;
    };
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
    setComposeRecipientId(null);
    if (conversationId != null) {
      setActiveConversationId(Number(conversationId));
      return;
    }
    // Resume where the user left off
    const stored = readStoredConversationId();
    if (stored) {
      setActiveConversationIdState(stored);
      activeConversationIdRef.current = stored;
    }
  }, [setActiveConversationId]);

  const closeInbox = useCallback(() => {
    setInboxOpen(false);
    setComposeRecipientId(null);
    // Keep activeConversationId so reopen resumes the same chat;
    // unread still bumps because viewingThread requires inboxOpen.
  }, []);

  const openConversation = useCallback((conversationId) => {
    setActiveConversationId(Number(conversationId));
    setComposeRecipientId(null);
    setInboxOpen(true);
  }, [setActiveConversationId]);

  const startCompose = useCallback((recipientUserId = null) => {
    setActiveConversationId(null);
    setComposeRecipientId(recipientUserId != null ? Number(recipientUserId) : null);
    setInboxOpen(true);
  }, [setActiveConversationId]);

  const clearActiveConversation = useCallback(() => {
    setActiveConversationId(null);
    setComposeRecipientId(null);
  }, [setActiveConversationId]);

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
      restoredSession,
      refreshInbox,
      openInbox,
      closeInbox,
      openConversation,
      startCompose,
      clearActiveConversation,
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
      restoredSession,
      refreshInbox,
      openInbox,
      closeInbox,
      openConversation,
      startCompose,
      clearActiveConversation,
      setActiveConversationId,
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
