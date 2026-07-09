"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PresenceDot, formatMessageTime } from "./presence";

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
  const conversationId = conversation?.id;

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
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-700">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:hidden"
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {peerLabel}
            </h2>
            {conversation.isOversight ? (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Oversight
              </span>
            ) : (
              <PresenceDot status={conversation.peer?.presence} showLabel />
            )}
          </div>
          {conversation.isOversight ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Read-only view of this conversation
            </p>
          ) : conversation.peer?.role ? (
            <p className="text-xs capitalize text-zinc-500 dark:text-zinc-400">
              {conversation.peer.role.replace("_", " ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Say hello to start the conversation.
          </p>
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
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-br-md bg-sky-600 text-white"
                      : "rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  }`}
                >
                  {conversation.isOversight && message.author?.username ? (
                    <p className="mb-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {message.author.username}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p
                    className={`mt-1 text-[10px] ${
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
          className="border-t border-zinc-200 p-3 dark:border-zinc-700"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={2}
              placeholder="Write a message…"
              className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-sky-400/40 placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-zinc-200 px-3 py-3 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Admin oversight — you can view this conversation but not send messages.
        </div>
      )}
    </div>
  );
}
