"use client";

import { PresenceDot, formatMessageTime } from "./presence";

export default function ConversationList({
  conversations,
  loading = false,
  activeConversationId = null,
  onSelect,
  onCompose,
  className = "",
}) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Messages</h2>
        <button
          type="button"
          onClick={onCompose}
          className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-950/70"
        >
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Loading conversations…
          </p>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No conversations yet.</p>
            <button
              type="button"
              onClick={onCompose}
              className="mt-3 text-sm font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
            >
              Start a message
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {conversations.map((conversation) => {
              const active = Number(activeConversationId) === Number(conversation.id);
              const unread = Number(conversation.unreadCount) > 0;
              const preview = conversation.lastMessage?.body || "No messages yet";
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`flex w-full items-start gap-2 px-3 py-3 text-left transition-colors ${
                      active
                        ? "bg-sky-50 dark:bg-sky-950/40"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                    }`}
                  >
                    <div className="mt-1.5">
                      <PresenceDot status={conversation.peer?.presence} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            unread
                              ? "font-semibold text-zinc-950 dark:text-zinc-50"
                              : "font-medium text-zinc-800 dark:text-zinc-100"
                          }`}
                        >
                          {conversation.peer?.username || "Unknown"}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                          {formatMessageTime(
                            conversation.lastMessageAt || conversation.lastMessage?.createdAt,
                          )}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p
                          className={`min-w-0 flex-1 truncate text-xs ${
                            unread
                              ? "font-medium text-zinc-700 dark:text-zinc-200"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {preview}
                        </p>
                        {unread ? (
                          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[10px] font-bold text-white">
                            {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
