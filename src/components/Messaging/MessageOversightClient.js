"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConversationView from "@/components/Messaging/ConversationView";
import { PresenceDot, formatMessageTime } from "@/components/Messaging/presence";

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

  // Live presence from MessagingProvider socket (admin is in presence:observers)
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
    <div className="flex h-[min(75vh,760px)] min-h-0 overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm dark:border-amber-900/40 dark:bg-zinc-950">
      <div
        className={`flex w-full min-h-0 flex-col border-r border-zinc-200 dark:border-zinc-800 sm:w-[300px] sm:shrink-0 ${
          mobileShowThread && active ? "hidden sm:flex" : "flex"
        }`}
      >
        <div className="border-b border-amber-100 bg-amber-50/80 px-3 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              All chats
            </h2>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/60"
            >
              Refresh
            </button>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users or messages…"
            className="mt-2 w-full rounded-lg border border-amber-200/80 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none ring-amber-400/40 placeholder:text-zinc-400 focus:ring-2 dark:border-amber-900/50 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading…
            </p>
          ) : error ? (
            <p className="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No conversations found.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((conversation) => {
                const selected = Number(activeId) === Number(conversation.id);
                const preview = conversation.lastMessage?.body || "No messages yet";
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(conversation.id)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors ${
                        selected
                          ? "bg-amber-50 dark:bg-amber-950/40"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {conversation.peer?.username || "Unknown"}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                          {formatMessageTime(
                            conversation.lastMessageAt || conversation.lastMessage?.createdAt,
                          )}
                        </span>
                      </div>
                      {Array.isArray(conversation.participants) ? (
                        <div className="flex flex-wrap gap-2">
                          {conversation.participants.map((p) =>
                            p?.id ? (
                              <span
                                key={p.id}
                                className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400"
                              >
                                <PresenceDot status={p.presence} />
                                {p.username}
                              </span>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{preview}</p>
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
          <div className="flex h-full flex-1 items-center justify-center p-6">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a conversation to review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
