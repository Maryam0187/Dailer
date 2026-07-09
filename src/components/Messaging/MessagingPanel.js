"use client";

import { useEffect, useMemo, useState } from "react";
import { useMessaging } from "@/contexts/MessagingContext";
import ConversationList from "./ConversationList";
import ConversationView from "./ConversationView";
import ComposeView from "./ComposeView";

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
    markLocalRead,
    mergeConversation,
    refreshInbox,
  } = useMessaging();

  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    if (composeRecipientId != null) {
      setShowCompose(true);
      setMobileShowThread(true);
    }
  }, [composeRecipientId]);

  useEffect(() => {
    if (activeConversationId != null) {
      setShowCompose(false);
      setMobileShowThread(true);
      markLocalRead(activeConversationId);
    }
  }, [activeConversationId, markLocalRead]);

  const activeConversation = useMemo(
    () => conversations.find((c) => Number(c.id) === Number(activeConversationId)) || null,
    [conversations, activeConversationId],
  );

  function handleSelect(id) {
    setActiveConversationId(id);
    setComposeRecipientId(null);
    setShowCompose(false);
    setMobileShowThread(true);
    markLocalRead(id);
  }

  function handleCompose() {
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
    setActiveConversationId(null);
    setComposeRecipientId(null);
  }

  const showThreadPane = showCompose || activeConversationId != null;
  const isSlideOver = mode === "slideover";

  return (
    <div
      className={`flex min-h-0 overflow-hidden bg-white dark:bg-zinc-950 ${
        isSlideOver
          ? "h-full"
          : "h-[min(70vh,720px)] rounded-2xl border border-zinc-200 dark:border-zinc-800"
      } ${className}`}
    >
      <div
        className={`w-full min-h-0 border-r border-zinc-200 dark:border-zinc-800 sm:w-[280px] sm:shrink-0 ${
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
          onSelect={handleSelect}
          onCompose={handleCompose}
          className="min-h-0 flex-1"
        />
      </div>

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
            onBack={handleBackToList}
            onMessageSent={handleMessageSent}
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="hidden h-full flex-1 items-center justify-center p-6 sm:flex">
            <div className="text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Select a conversation or start a new message.
              </p>
              <button
                type="button"
                onClick={handleCompose}
                className="mt-3 text-sm font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400"
              >
                New message
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
