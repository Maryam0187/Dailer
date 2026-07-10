"use client";

import { UserAvatar, formatMessageTime, roleLabel } from "./presence";

function EmptyInbox({ onCompose }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path
            fillRule="evenodd"
            d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">No conversations yet</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Start a chat with any active teammate.
      </p>
      <button
        type="button"
        onClick={onCompose}
        className="mt-4 inline-flex items-center rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500"
      >
        New message
      </button>
    </div>
  );
}

export default function ConversationList({
  conversations,
  loading = false,
  activeConversationId = null,
  activeNewCount = 0,
  onSelect,
  onCompose,
  className = "",
}) {
  const listUnreadTotal = conversations.reduce((sum, c) => {
    const active = Number(activeConversationId) === Number(c.id);
    const count = active ? Number(activeNewCount) || 0 : Number(c.unreadCount) || 0;
    return sum + count;
  }, 0);

  return (
    <div className={`flex h-full min-h-0 flex-col bg-zinc-50/80 dark:bg-zinc-950 ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Inbox
          </h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
            {listUnreadTotal > 0 ? ` · ${listUnreadTotal} unread` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onCompose}
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 hover:bg-sky-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-xl bg-white/70 p-3 dark:bg-zinc-900/50"
              >
                <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-2.5 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800/80" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyInbox onCompose={onCompose} />
        ) : (
          <ul className="space-y-1 p-2">
            {conversations.map((conversation) => {
              const active = Number(activeConversationId) === Number(conversation.id);
              const badgeCount = active
                ? Number(activeNewCount) || 0
                : Number(conversation.unreadCount) || 0;
              const hasUnread = badgeCount > 0;
              const preview = conversation.lastMessage?.body || "No messages yet";
              const name = conversation.peer?.username || "Unknown";
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-white shadow-sm ring-1 ring-sky-200/80 dark:bg-zinc-900 dark:ring-sky-900/60"
                        : hasUnread
                          ? "bg-sky-50/90 hover:bg-sky-50 dark:bg-sky-950/30 dark:hover:bg-sky-950/45"
                          : "hover:bg-white/80 dark:hover:bg-zinc-900/70"
                    }`}
                  >
                    <UserAvatar name={name} presence={conversation.peer?.presence} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`truncate text-sm ${
                              hasUnread
                                ? "font-bold text-sky-800 dark:text-sky-300"
                                : "font-medium text-zinc-800 dark:text-zinc-100"
                            }`}
                          >
                            {name}
                          </span>
                          {hasUnread ? (
                            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[10px] font-bold text-white">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] tabular-nums ${
                            hasUnread
                              ? "font-semibold text-sky-700 dark:text-sky-400"
                              : "text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {formatMessageTime(
                            conversation.lastMessageAt || conversation.lastMessage?.createdAt,
                          )}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p
                          className={`min-w-0 flex-1 truncate text-xs ${
                            hasUnread
                              ? "font-semibold text-zinc-800 dark:text-zinc-100"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {preview}
                        </p>
                        {!hasUnread && conversation.peer?.role ? (
                          <span className="hidden shrink-0 capitalize text-[10px] text-zinc-400 sm:inline dark:text-zinc-500">
                            {roleLabel(conversation.peer.role)}
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
