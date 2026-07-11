"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColoredName,
  PresenceDot,
  UserAvatar,
  buildParticipantNameColors,
  formatMessageClock,
  formatMessageDateLabel,
  messageDayKey,
  roleLabel,
} from "./presence";
import { readMessageDraft, writeMessageDraft } from "@/contexts/MessagingContext";

function DateSeparator({ label }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-2 py-2" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {label}
      </span>
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}

function NewMessagesDivider({ count, onDismiss }) {
  if (!count || count <= 0) return null;
  return (
    <div
      className="flex cursor-default items-center gap-2 py-2"
      role="separator"
      aria-label={`${count} new messages`}
      onPointerEnter={onDismiss}
      onClick={onDismiss}
    >
      <div className="h-px flex-1 bg-sky-300/90 dark:bg-sky-700/80" />
      <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-950/70 dark:text-sky-300">
        {count} new message{count === 1 ? "" : "s"}
      </span>
      <div className="h-px flex-1 bg-sky-300/90 dark:bg-sky-700/80" />
    </div>
  );
}

export default function ConversationView({
  conversation,
  currentUserId,
  initialUnreadCount = 0,
  onBack = null,
  onMessageSent,
  onNewMessageCountChange = null,
  onExpandInbox = null,
  className = "",
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  // WhatsApp-style: show a divider before this message id
  const [dividerBeforeId, setDividerBeforeId] = useState(null);
  const [nearBottom, setNearBottom] = useState(true);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const dividerRef = useRef(null);
  const textareaRef = useRef(null);
  const nearBottomRef = useRef(true);
  const unreadOnOpenRef = useRef(0);
  const conversationId = conversation?.id;
  const skipDraftPersistRef = useRef(false);

  function isNearBottom(el) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function setNearBottomState(value) {
    nearBottomRef.current = value;
    setNearBottom(value);
  }

  function scrollToBottom(smooth = true) {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    setNearBottomState(true);
  }

  function clearNewDivider() {
    setDividerBeforeId(null);
  }

  function jumpToNewMessages() {
    clearNewDivider();
    scrollToBottom(true);
  }

  function onListScroll() {
    const el = listRef.current;
    setNearBottomState(isNearBottom(el));
    // Keep the new-messages line until hover, send, or jump-to-new click
  }

  // Capture unread seed for this open + restore draft
  useEffect(() => {
    if (!conversationId) return;
    unreadOnOpenRef.current = Number(initialUnreadCount) || 0;
    setDividerBeforeId(null);
    skipDraftPersistRef.current = true;
    setDraft(readMessageDraft(conversationId));
    setNearBottomState(true);
  }, [conversationId, initialUnreadCount]);

  useEffect(() => {
    if (!conversationId) return;
    if (skipDraftPersistRef.current) {
      skipDraftPersistRef.current = false;
      return;
    }
    writeMessageDraft(conversationId, draft);
  }, [conversationId, draft]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to load messages");
        return;
      }
      const rows = Array.isArray(data.messages) ? data.messages : [];
      setMessages(rows);

      const unread = unreadOnOpenRef.current;
      if (unread > 0 && rows.length > 0) {
        const startIdx = Math.max(0, rows.length - unread);
        const firstNewId = rows[startIdx]?.id ?? null;
        setDividerBeforeId(firstNewId);
        // Scroll to the new-messages line (WhatsApp-style)
        requestAnimationFrame(() => {
          dividerRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
          setNearBottomState(isNearBottom(listRef.current));
        });
      } else {
        setDividerBeforeId(null);
        requestAnimationFrame(() => scrollToBottom(false));
      }
    } catch {
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!conversationId) return undefined;
    fetch(`/api/messages/conversations/${conversationId}/read`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    function onRealtime(event) {
      const detail = event.detail;
      if (!detail || Number(detail.conversationId) !== Number(conversationId)) return;
      const message = detail.message;
      if (!message?.id) return;

      const fromOther = Number(message.userId) !== Number(currentUserId);
      const wasNearBottom = nearBottomRef.current;

      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Incoming message while this chat is open → WhatsApp-style new-messages line
      if (fromOther && !detail.self) {
        setDividerBeforeId((current) => current ?? message.id);
      }

      if (wasNearBottom) {
        requestAnimationFrame(() => scrollToBottom(true));
      }
    }
    window.addEventListener("dialer:message:new", onRealtime);
    return () => window.removeEventListener("dialer:message:new", onRealtime);
  }, [conversationId, currentUserId]);

  const peerLabel = useMemo(
    () => conversation?.peer?.username || "Conversation",
    [conversation?.peer?.username],
  );

  const newMessageCount = useMemo(() => {
    if (!dividerBeforeId) return 0;
    const idx = messages.findIndex((m) => Number(m.id) === Number(dividerBeforeId));
    if (idx < 0) return 0;
    return messages.length - idx;
  }, [messages, dividerBeforeId]);

  useEffect(() => {
    if (loading) return;
    onNewMessageCountChange?.(newMessageCount);
  }, [loading, newMessageCount, onNewMessageCountChange]);

  const oversightNameColors = useMemo(() => {
    if (!conversation?.isOversight) return {};
    const fromParticipants = conversation.participants || [];
    if (fromParticipants.length > 0) {
      return buildParticipantNameColors(fromParticipants);
    }
    const authors = messages.map((m) => m.author).filter(Boolean);
    return buildParticipantNameColors(authors);
  }, [conversation?.isOversight, conversation?.participants, messages]);

  async function handleSend(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !conversationId || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send");
        return;
      }
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        onMessageSent?.(data.message, conversation);
      }
      setDraft("");
      writeMessageDraft(conversationId, "");
      clearNewDivider();
      setNearBottomState(true);
      requestAnimationFrame(() => scrollToBottom(true));
      textareaRef.current?.focus();
    } catch {
      setError("Failed to send");
    } finally {
      setSending(false);
    }
  }

  if (!conversation) {
    return (
      <div className={`flex h-full items-center justify-center p-6 ${className}`}>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Select a conversation</p>
      </div>
    );
  }

  const canSend = conversation.canSend !== false && !conversation.isOversight;

  return (
    <div className={`flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950 ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200/80 bg-white/90 px-3 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        {onExpandInbox ? (
          <button
            type="button"
            onClick={onExpandInbox}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 sm:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Show inbox"
            title="Show inbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M4.21 2.47a.75.75 0 011.06-.06l5.26 5.99a.75.75 0 010 .99l-5.26 5.99a.75.75 0 11-1.12-.99L8.94 9 4.15 3.53a.75.75 0 01.06-1.06zm7 0a.75.75 0 011.06-.06l5.26 5.99a.75.75 0 010 .99l-5.26 5.99a.75.75 0 11-1.12-.99L15.94 9l-4.79-5.47a.75.75 0 01.06-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : null}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:hidden"
            aria-label="Back to conversations"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : null}
        {!conversation.isOversight ? (
          <UserAvatar name={peerLabel} presence={conversation.peer?.presence} size="md" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {peerLabel}
            </h2>
            {conversation.isOversight ? (
              <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Oversight
              </span>
            ) : null}
          </div>
          {conversation.isOversight ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Read-only view of this conversation
            </p>
          ) : (
            <div className="mt-0.5 flex items-center gap-2">
              <PresenceDot status={conversation.peer?.presence} showLabel />
              {conversation.peer?.role ? (
                <span className="text-xs capitalize text-zinc-400 dark:text-zinc-500">
                  · {roleLabel(conversation.peer.role)}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="h-full space-y-3 overflow-y-auto bg-gradient-to-b from-zinc-50/80 to-white px-3 py-4 dark:from-zinc-900/40 dark:to-zinc-950"
        >
          {loading ? (
            <div className="space-y-3 py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                  <div className="h-12 w-2/5 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No messages yet</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Say hello to start the conversation.
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const mine =
                !conversation.isOversight &&
                Number(message.userId) === Number(currentUserId);
              const showDivider = Number(dividerBeforeId) === Number(message.id);
              const dayKey = messageDayKey(message.createdAt);
              const prevDayKey = index > 0 ? messageDayKey(messages[index - 1]?.createdAt) : null;
              const showDateSeparator = Boolean(dayKey) && dayKey !== prevDayKey;
              return (
                <Fragment key={message.id}>
                  {showDateSeparator ? (
                    <DateSeparator label={formatMessageDateLabel(message.createdAt)} />
                  ) : null}
                  {showDivider ? (
                    <div ref={dividerRef}>
                      <NewMessagesDivider count={newMessageCount} onDismiss={clearNewDivider} />
                    </div>
                  ) : null}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                        mine
                          ? "rounded-br-md bg-sky-600 text-white shadow-sky-600/20"
                          : "rounded-bl-md border border-zinc-200/80 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {conversation.isOversight && message.author?.username ? (
                        <p className="mb-1 text-xs">
                          <ColoredName
                            name={message.author.username}
                            colorClass={oversightNameColors[message.author.username]}
                          />
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                      <p
                        className={`mt-1.5 text-[10px] tabular-nums ${
                          mine ? "text-sky-100/90" : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {formatMessageClock(message.createdAt)}
                      </p>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {newMessageCount > 0 && !nearBottom ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <button
              type="button"
              onClick={jumpToNewMessages}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-sky-600/30 hover:bg-sky-500"
              aria-label={`${newMessageCount} new messages`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                  clipRule="evenodd"
                />
              </svg>
              {newMessageCount} new
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="px-3 pb-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {canSend ? (
        <form
          onSubmit={handleSend}
          className="border-t border-zinc-200/80 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-1.5 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-sky-700">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={1}
              placeholder="Write a message…"
              className="max-h-28 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.926A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
            Enter to send · Shift+Enter for new line
          </p>
        </form>
      ) : (
        <div className="border-t border-amber-200/70 bg-amber-50 px-3 py-3 text-center text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Admin oversight — view only. You cannot send in this thread.
        </div>
      )}
    </div>
  );
}
