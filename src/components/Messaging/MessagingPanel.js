"use client";

import { useEffect, useMemo, useState } from "react";
import { useMessaging } from "@/contexts/MessagingContext";
import ConversationList from "./ConversationList";
import ConversationView from "./ConversationView";
import ComposeView from "./ComposeView";

const INBOX_COLLAPSED_KEY = "dialer:messages:inboxCollapsed";

function readInboxCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(INBOX_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeInboxCollapsed(collapsed) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(INBOX_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function MessagingPanel({
  currentUserId,
  mode = "slideover",
  onClose = null,
  hideMobileClose = false,
  className = "",
}) {
  const {
    conversations,
    loadingInbox,
    activeConversationId,
    composeRecipientId,
    setActiveConversationId,
    setComposeRecipientId,
    clearActiveConversation,
    markLocalRead,
    mergeConversation,
    refreshInbox,
  } = useMessaging();

  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [openUnreadSeed, setOpenUnreadSeed] = useState({ id: null, count: 0 });
  const [activeNewCount, setActiveNewCount] = useState(0);
  const [inboxCollapsed, setInboxCollapsed] = useState(false);

  useEffect(() => {
    setInboxCollapsed(readInboxCollapsed());
  }, []);

  function setCollapsed(next) {
    setInboxCollapsed(next);
    writeInboxCollapsed(next);
  }

  useEffect(() => {
    if (composeRecipientId != null) {
      setShowCompose(true);
      setMobileShowThread(true);
    }
  }, [composeRecipientId]);

  useEffect(() => {
    if (activeConversationId == null) {
      setActiveNewCount(0);
      return;
    }
    // Capture unread before mark-read clears it (for WhatsApp-style divider)
    setOpenUnreadSeed((prev) => {
      if (prev.id === activeConversationId) return prev;
      const conv = conversations.find((c) => Number(c.id) === Number(activeConversationId));
      return { id: activeConversationId, count: Number(conv?.unreadCount) || 0 };
    });
    setShowCompose(false);
    setMobileShowThread(true);
    markLocalRead(activeConversationId);
    // Only re-run when the open conversation changes — not when unread is cleared
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, markLocalRead]);

  useEffect(() => {
    if (activeConversationId == null) return;
    if (openUnreadSeed.id === activeConversationId) {
      setActiveNewCount(Number(openUnreadSeed.count) || 0);
    }
  }, [activeConversationId, openUnreadSeed]);

  const activeConversation = useMemo(
    () => conversations.find((c) => Number(c.id) === Number(activeConversationId)) || null,
    [conversations, activeConversationId],
  );

  const listUnreadTotal = useMemo(
    () =>
      conversations.reduce((sum, c) => {
        const active = Number(activeConversationId) === Number(c.id);
        const count = active ? Number(activeNewCount) || 0 : Number(c.unreadCount) || 0;
        return sum + count;
      }, 0),
    [conversations, activeConversationId, activeNewCount],
  );

  const initialUnreadCount =
    openUnreadSeed.id === activeConversationId ? openUnreadSeed.count : 0;

  function handleSelect(id) {
    const conv = conversations.find((c) => Number(c.id) === Number(id));
    const count = Number(conv?.unreadCount) || 0;
    setOpenUnreadSeed({ id: Number(id), count });
    setActiveNewCount(count);
    setActiveConversationId(id);
    setComposeRecipientId(null);
    setShowCompose(false);
    setMobileShowThread(true);
  }

  function handleCompose() {
    setCollapsed(false);
    setActiveConversationId(null);
    setComposeRecipientId(null);
    setShowCompose(true);
    setMobileShowThread(true);
  }

  function handleConversationReady(conversation) {
    if (!conversation?.id) return;
    mergeConversation(conversation);
    setActiveConversationId(conversation.id);
    setComposeRecipientId(null);
    setShowCompose(false);
    setMobileShowThread(true);
    refreshInbox();
  }

  function handleMessageSent(message, conversation) {
    if (!conversation?.id || !message) return;
    mergeConversation({
      ...conversation,
      lastMessageAt: message.createdAt,
      lastMessage: message,
      unreadCount: 0,
    });
  }

  function handleBackToList() {
    setMobileShowThread(false);
    setShowCompose(false);
    setActiveNewCount(0);
    setCollapsed(false);
    clearActiveConversation();
  }

  const showThreadPane = showCompose || activeConversationId != null;
  const isSlideOver = mode === "slideover";
  // Collapse only when a thread/compose is open (desktop side-by-side)
  const listCollapsed = inboxCollapsed && showThreadPane;

  return (
    <div
      className={`flex min-h-0 overflow-hidden ${
        isSlideOver
          ? "h-full bg-white dark:bg-zinc-950"
          : "h-[min(72vh,760px)] rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none"
      } ${className}`}
    >
      {listCollapsed ? (
        <div className="hidden h-full w-12 shrink-0 flex-col items-center border-r border-zinc-200/80 bg-zinc-50/80 py-3 sm:flex dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            aria-label="Expand inbox"
            title="Expand inbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M4.21 2.47a.75.75 0 011.06-.06l5.26 5.99a.75.75 0 010 .99l-5.26 5.99a.75.75 0 11-1.12-.99L8.94 9 4.15 3.53a.75.75 0 01.06-1.06zm7 0a.75.75 0 011.06-.06l5.26 5.99a.75.75 0 010 .99l-5.26 5.99a.75.75 0 11-1.12-.99L15.94 9l-4.79-5.47a.75.75 0 01.06-1.06z"
                clipRule="evenodd"
              />
            </svg>
            {listUnreadTotal > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">
                {listUnreadTotal > 99 ? "99+" : listUnreadTotal}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={handleCompose}
            className="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white hover:bg-sky-500"
            aria-label="New message"
            title="New message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          className={`w-full min-h-0 border-r border-zinc-200/80 dark:border-zinc-800 sm:w-[300px] sm:shrink-0 ${
            mobileShowThread && showThreadPane ? "hidden sm:flex sm:flex-col" : "flex flex-col"
          }`}
        >
          {isSlideOver && onClose && !hideMobileClose ? (
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 sm:hidden dark:border-zinc-700">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Inbox</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          ) : null}
          <ConversationList
            conversations={conversations}
            loading={loadingInbox}
            activeConversationId={activeConversationId}
            activeNewCount={activeNewCount}
            onSelect={handleSelect}
            onCompose={handleCompose}
            onCollapse={showThreadPane ? () => setCollapsed(true) : null}
            className="min-h-0 flex-1"
          />
        </div>
      )}

      <div
        className={`min-h-0 min-w-0 flex-1 ${
          mobileShowThread && showThreadPane ? "flex flex-col" : "hidden sm:flex sm:flex-col"
        }`}
      >
        {showCompose ? (
          <ComposeView
            initialRecipientId={composeRecipientId}
            onBack={handleBackToList}
            onConversationReady={handleConversationReady}
            className="min-h-0 flex-1"
          />
        ) : activeConversation ? (
          <ConversationView
            conversation={activeConversation}
            currentUserId={currentUserId}
            initialUnreadCount={initialUnreadCount}
            onBack={handleBackToList}
            onMessageSent={handleMessageSent}
            onNewMessageCountChange={setActiveNewCount}
            onExpandInbox={listCollapsed ? () => setCollapsed(false) : null}
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="hidden h-full flex-1 flex-col items-center justify-center bg-gradient-to-b from-zinc-50 to-white p-8 sm:flex dark:from-zinc-900/40 dark:to-zinc-950">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
                <path
                  fillRule="evenodd"
                  d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              Select a conversation
            </p>
            <p className="mt-1 max-w-xs text-center text-xs text-zinc-500 dark:text-zinc-400">
              Pick someone from the inbox, or start a new message.
            </p>
            <button
              type="button"
              onClick={handleCompose}
              className="mt-4 inline-flex items-center rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500"
            >
              New message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
