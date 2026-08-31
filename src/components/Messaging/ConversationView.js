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
import {
  AttachFileIcon,
  MessageAttachmentList,
  PendingAttachmentList,
} from "@/components/Messaging/MessageAttachmentParts";

const COMPOSER_MIN_HEIGHT = 80;
const COMPOSER_MAX_HEIGHT = 224;
const COMPOSER_DEFAULT_HEIGHT = 80;

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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

function CopyMessageButton({ text, mine }) {
  const [copied, setCopied] = useState(false);
  const body = typeof text === "string" ? text : "";
  if (!body) return null;

  async function onCopy() {
    const ok = await copyText(body);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={copied ? "Message copied" : "Copy message"}
      title={copied ? "Copied!" : "Copy message"}
      className={`inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${
        mine
          ? "text-sky-100/80 hover:bg-sky-500 hover:text-white"
          : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      }`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
          <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
        </svg>
      )}
    </button>
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
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [attachmentUploadConfig, setAttachmentUploadConfig] = useState(null);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_DEFAULT_HEIGHT);
  // WhatsApp-style: show a divider before this message id
  const [dividerBeforeId, setDividerBeforeId] = useState(null);
  const [nearBottom, setNearBottom] = useState(true);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const dividerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const nearBottomRef = useRef(true);
  const unreadOnOpenRef = useRef(0);
  const conversationId = conversation?.id;
  const skipDraftPersistRef = useRef(false);
  const resizeDragRef = useRef(null);

  function onComposerResizeStart(event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    resizeDragRef.current = {
      startY: event.clientY,
      startHeight: composerHeight,
    };
    const onMove = (moveEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // Dragging the top edge up grows the box; down shrinks it.
      const next = drag.startHeight + (drag.startY - moveEvent.clientY);
      setComposerHeight(Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, next)));
    };
    const onUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

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
    setPendingAttachments([]);
    setNearBottomState(true);
  }, [conversationId, initialUnreadCount]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/messages/attachments/config", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setAttachmentUploadConfig({
            mimeTypes: Array.isArray(data.mimeTypes) ? data.mimeTypes : [],
            mimeTypeSet: new Set(Array.isArray(data.mimeTypes) ? data.mimeTypes : []),
            accept: typeof data.accept === "string" ? data.accept : "",
            maxSizeBytes: Number(data.maxSizeBytes) || 10 * 1024 * 1024,
            maxAttachmentsPerMessage: Number(data.maxAttachmentsPerMessage) || 5,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const readyAttachmentIds = useMemo(
    () =>
      pendingAttachments
        .filter((item) => item.id && !item.uploading && !item.error)
        .map((item) => item.id),
    [pendingAttachments],
  );

  const hasUploadingAttachments = pendingAttachments.some((item) => item.uploading);

  const maxAttachmentsPerMessage = attachmentUploadConfig?.maxAttachmentsPerMessage ?? 5;
  const maxAttachmentSizeBytes = attachmentUploadConfig?.maxSizeBytes ?? 10 * 1024 * 1024;
  const allowedMimeTypeSet = attachmentUploadConfig?.mimeTypeSet ?? new Set();

  async function uploadSelectedFile(file) {
    if (!conversationId || !file) return;
    if (!attachmentUploadConfig) {
      setError("Attachment settings are still loading");
      return;
    }

    const mimeType = String(file.type || "").toLowerCase().split(";")[0];
    if (!allowedMimeTypeSet.has(mimeType)) {
      setError("That file type is not supported");
      return;
    }
    if (file.size > maxAttachmentSizeBytes) {
      setError(`File is too large (max ${Math.round(maxAttachmentSizeBytes / (1024 * 1024))} MB)`);
      return;
    }
    if (pendingAttachments.length >= maxAttachmentsPerMessage) {
      setError(`You can attach up to ${maxAttachmentsPerMessage} files per message`);
      return;
    }

    const localKey = `${Date.now()}-${file.name}`;
    setPendingAttachments((prev) => [
      ...prev,
      {
        localKey,
        originalName: file.name,
        mimeType,
        sizeBytes: file.size,
        uploading: true,
        error: null,
        id: null,
      },
    ]);
    setError(null);

    try {
      const presignRes = await fetch("/api/messages/attachments/presign-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          filename: file.name,
          mimeType,
          sizeBytes: file.size,
        }),
      });
      const presignData = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) {
        throw new Error(presignData.error || "Failed to prepare upload");
      }

      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json().catch(() => ({}));
        throw new Error(uploadData.error || "Upload failed");
      }

      setPendingAttachments((prev) =>
        prev.map((item) =>
          item.localKey === localKey
            ? {
                ...item,
                uploading: false,
                id: presignData.attachment?.id ?? null,
                originalName: presignData.attachment?.originalName || item.originalName,
              }
            : item,
        ),
      );
    } catch (err) {
      const message =
        err?.message === "Failed to fetch"
          ? "Upload failed — could not reach the server"
          : err?.message || "Upload failed";
      setPendingAttachments((prev) =>
        prev.map((item) =>
          item.localKey === localKey
            ? { ...item, uploading: false, error: message }
            : item,
        ),
      );
      setError(message);
    }
  }

  function onFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const slotsLeft = maxAttachmentsPerMessage - pendingAttachments.length;
    if (slotsLeft <= 0) {
      setError(`You can attach up to ${maxAttachmentsPerMessage} files per message`);
      return;
    }
    files.slice(0, slotsLeft).forEach((file) => {
      void uploadSelectedFile(file);
    });
    if (files.length > slotsLeft) {
      setError(`Only ${slotsLeft} more file${slotsLeft === 1 ? "" : "s"} can be attached`);
    }
  }

  function removePendingAttachment(localKey) {
    setPendingAttachments((prev) => prev.filter((item) => item.localKey !== localKey));
  }

  async function handleSend(event) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !readyAttachmentIds.length) || !conversationId || sending || hasUploadingAttachments) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachmentIds: readyAttachmentIds }),
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
      setPendingAttachments([]);
      writeMessageDraft(conversationId, "");
      clearNewDivider();
      setNearBottomState(true);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch {
      setError("Failed to send");
    } finally {
      setSending(false);
      // Keep caret ready for the next message (disabled inputs can't hold focus).
      requestAnimationFrame(() => textareaRef.current?.focus());
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
                      {message.body ? (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                      ) : null}
                      <MessageAttachmentList
                        attachments={message.attachments}
                        mine={mine}
                      />
                      <div className="mt-1.5 flex items-center justify-end gap-1">
                        <p
                          className={`text-[10px] tabular-nums ${
                            mine ? "text-sky-100/90" : "text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {formatMessageClock(message.createdAt)}
                        </p>
                        <CopyMessageButton text={message.body} mine={mine} />
                      </div>
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
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-sky-700">
            <PendingAttachmentList items={pendingAttachments} onRemove={removePendingAttachment} />
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize message box"
              aria-valuemin={COMPOSER_MIN_HEIGHT}
              aria-valuemax={COMPOSER_MAX_HEIGHT}
              aria-valuenow={Math.round(composerHeight)}
              onPointerDown={onComposerResizeStart}
              className="group flex h-3 cursor-ns-resize items-center justify-center bg-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80"
              title="Drag to resize"
            >
              <span className="h-0.5 w-8 rounded-full bg-zinc-300 transition-colors group-hover:bg-zinc-400 dark:bg-zinc-600 dark:group-hover:bg-zinc-500" />
            </div>
            <div className="flex items-end gap-1.5 px-1.5 pb-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFilesSelected}
                accept={attachmentUploadConfig?.accept || ".doc,.docx"}
              />
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
                style={{ height: composerHeight }}
                placeholder="Write a message…"
                className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || hasUploadingAttachments || !attachmentUploadConfig}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label="Attach file"
                title="Attach file"
              >
                <AttachFileIcon className="h-5 w-5" />
              </button>
              <button
                type="submit"
                disabled={sending || hasUploadingAttachments || (!draft.trim() && !readyAttachmentIds.length)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.926A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
                </svg>
              </button>
            </div>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
            Enter to send · Shift+Enter for new line · Drag top edge to resize · Word files only (.doc, .docx), up to{" "}
            {Math.round(maxAttachmentSizeBytes / (1024 * 1024))} MB each
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
