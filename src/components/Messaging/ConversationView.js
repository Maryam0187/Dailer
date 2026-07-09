"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColoredName,
  PresenceDot,
  UserAvatar,
  buildParticipantNameColors,
  formatMessageTime,
  roleLabel,
} from "./presence";
import { readMessageDraft, writeMessageDraft } from "@/contexts/MessagingContext";

export default function ConversationView({
  conversation,
  currentUserId,
  onBack = null,
  onMessageSent,
  className = "",
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const conversationId = conversation?.id;
  const skipDraftPersistRef = useRef(false);

  // Restore unsent draft when opening / switching chats
  useEffect(() => {
    if (!conversationId) return;
    skipDraftPersistRef.current = true;
    setDraft(readMessageDraft(conversationId));
  }, [conversationId]);

  // Persist draft (skip the restore write so we don't clobber another chat)
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
      setMessages(Array.isArray(data.messages) ? data.messages : []);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function onRealtime(event) {
      const detail = event.detail;
      if (!detail || Number(detail.conversationId) !== Number(conversationId)) return;
      const message = detail.message;
      if (!message?.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    }
    window.addEventListener("dialer:message:new", onRealtime);
    return () => window.removeEventListener("dialer:message:new", onRealtime);
  }, [conversationId]);

  const peerLabel = useMemo(
    () => conversation?.peer?.username || "Conversation",
    [conversation?.peer?.username],
  );

  // Oversight: assign high-contrast colors per participant in this chat
  const oversightNameColors = useMemo(() => {
    if (!conversation?.isOversight) return {};
    const fromParticipants = conversation.participants || [];
    if (fromParticipants.length > 0) {
      return buildParticipantNameColors(fromParticipants);
    }
    // Fallback from message authors if participants aren't loaded
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-zinc-50/80 to-white px-3 py-4 dark:from-zinc-900/40 dark:to-zinc-950">
        {loading ? (
          <div className="space-y-3 py-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}
              >
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
          messages.map((message) => {
            const mine =
              !conversation.isOversight &&
              Number(message.userId) === Number(currentUserId);
            return (
              <div
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
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
                    {formatMessageTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
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
