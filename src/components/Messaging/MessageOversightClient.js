"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConversationView from "@/components/Messaging/ConversationView";
import { UserAvatar, formatMessageTime } from "@/components/Messaging/presence";

export default function MessageOversightClient({ currentUserId }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/admin/conversations", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to load conversations");
        return;
      }
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      setError("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onPresence(event) {
      const userId = Number(event.detail?.userId);
      if (!Number.isInteger(userId) || userId <= 0) return;
      const presence = event.detail?.presence;
      const lastActiveAt = event.detail?.lastActiveAt ?? null;
      setConversations((prev) =>
        prev.map((c) => {
          if (!Array.isArray(c.participants)) return c;
          let changed = false;
          const participants = c.participants.map((p) => {
            if (!p || Number(p.id) !== userId) return p;
            changed = true;
            return {
              ...p,
              presence,
              lastActiveAt: lastActiveAt ?? p.lastActiveAt ?? null,
            };
          });
          if (!changed) return c;
          const names = participants.map((p) => p?.username || "Unknown");
          return {
            ...c,
            participants,
            peer: c.peer
              ? { ...c.peer, username: `${names[0] || "Unknown"} ↔ ${names[1] || "Unknown"}` }
              : c.peer,
          };
        }),
      );
    }
    window.addEventListener("dialer:presence:update", onPresence);
    return () => window.removeEventListener("dialer:presence:update", onPresence);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const label = c.peer?.username || "";
      const names = (c.participants || []).map((p) => p.username).join(" ");
      const preview = c.lastMessage?.body || "";
      return `${label} ${names} ${preview}`.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  const active = useMemo(
    () => conversations.find((c) => Number(c.id) === Number(activeId)) || null,
    [conversations, activeId],
  );

  function handleSelect(id) {
    setActiveId(id);
    setMobileShowThread(true);
  }

  return (
    <div className="flex h-[min(75vh,760px)] min-h-0 overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm shadow-amber-950/5 dark:border-amber-900/40 dark:bg-zinc-950 dark:shadow-none">
      <div
        className={`flex w-full min-h-0 flex-col border-r border-zinc-200/80 bg-amber-50/30 dark:border-zinc-800 dark:bg-amber-950/10 sm:w-[320px] sm:shrink-0 ${
          mobileShowThread && active ? "hidden sm:flex" : "flex"
        }`}
      >
        <div className="border-b border-amber-200/70 px-3 py-3 dark:border-amber-900/40">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                All chats
              </h2>
              <p className="text-[11px] text-amber-800/70 dark:text-amber-300/70">
                {filtered.length} conversation{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/60"
            >
              Refresh
            </button>
          </div>
          <div className="relative mt-2.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700/50 dark:text-amber-400/50"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users or messages…"
              className="w-full rounded-xl border border-amber-200/80 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 outline-none ring-amber-400/40 placeholder:text-zinc-400 focus:ring-2 dark:border-amber-900/50 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse gap-3 rounded-xl p-2.5">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950/40" />
                  <div className="min-w-0 flex-1 space-y-2 py-1">
                    <div className="h-3 w-2/3 rounded bg-amber-100 dark:bg-amber-950/40" />
                    <div className="h-2.5 w-full rounded bg-amber-50 dark:bg-amber-950/20" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No conversations found.
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((conversation) => {
                const selected = Number(activeId) === Number(conversation.id);
                const preview = conversation.lastMessage?.body || "No messages yet";
                const participants = Array.isArray(conversation.participants)
                  ? conversation.participants.filter((p) => p?.id)
                  : [];
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(conversation.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                        selected
                          ? "bg-white shadow-sm ring-1 ring-amber-200 dark:bg-zinc-900 dark:ring-amber-900/50"
                          : "hover:bg-white/80 dark:hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="relative mt-0.5 flex shrink-0">
                        {participants[0] ? (
                          <UserAvatar
                            name={participants[0].username}
                            presence={participants[0].presence}
                            size="sm"
                          />
                        ) : null}
                        {participants[1] ? (
                          <UserAvatar
                            name={participants[1].username}
                            presence={participants[1].presence}
                            size="sm"
                            className="-ml-3"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {conversation.peer?.username || "Unknown"}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                            {formatMessageTime(
                              conversation.lastMessageAt || conversation.lastMessage?.createdAt,
                            )}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {preview}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 ${
          mobileShowThread && active ? "flex flex-col" : "hidden sm:flex sm:flex-col"
        }`}
      >
        {active ? (
          <ConversationView
            conversation={active}
            currentUserId={currentUserId}
            onBack={() => {
              setMobileShowThread(false);
              setActiveId(null);
            }}
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="flex h-full flex-1 flex-col items-center justify-center bg-gradient-to-b from-amber-50/40 to-white p-8 dark:from-amber-950/10 dark:to-zinc-950">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Select a conversation to review
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Read-only oversight of teammate DMs
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
