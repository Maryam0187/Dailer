"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar, roleLabel } from "./presence";

export default function ComposeView({
  initialRecipientId = null,
  onBack,
  onConversationReady,
  className = "",
}) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const autoOpenedRef = useRef(false);
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/messages/contacts", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok) {
            setContacts(Array.isArray(data.contacts) ? data.contacts : []);
          } else {
            setError(data.error || "Failed to load contacts");
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load contacts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!initialRecipientId || creating || loading || autoOpenedRef.current) return;
    const match = contacts.find((c) => Number(c.id) === Number(initialRecipientId));
    if (match) {
      autoOpenedRef.current = true;
      void openWith(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipientId, loading, contacts]);

  useEffect(() => {
    function onPresence(event) {
      const userId = Number(event.detail?.userId);
      if (!Number.isInteger(userId) || userId <= 0) return;
      const presence = event.detail?.presence;
      const lastActiveAt = event.detail?.lastActiveAt ?? null;
      setContacts((prev) =>
        prev.map((c) =>
          Number(c.id) === userId
            ? {
                ...c,
                presence,
                lastActiveAt: lastActiveAt ?? c.lastActiveAt ?? null,
              }
            : c,
        ),
      );
    }
    window.addEventListener("dialer:presence:update", onPresence);
    return () => window.removeEventListener("dialer:presence:update", onPresence);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        String(c.role || "")
          .toLowerCase()
          .includes(q),
    );
  }, [contacts, search]);

  async function openWith(recipientUserId) {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not open conversation");
        return;
      }
      onConversationReady?.(data.conversation);
    } catch {
      setError("Could not open conversation");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950 ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">New message</h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Choose who to message</p>
        </div>
      </div>

      <div className="border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800">
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none ring-sky-400/40 placeholder:text-zinc-400 focus:border-sky-300 focus:bg-white focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-sky-700"
          />
        </div>
      </div>

      {error ? (
        <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950">
        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl p-2">
                <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No matching users.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {filtered.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void openWith(contact.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white hover:shadow-sm disabled:opacity-60 dark:hover:bg-zinc-900"
                >
                  <UserAvatar name={contact.username} presence={contact.presence} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {contact.username}
                    </p>
                    <p className="text-xs capitalize text-zinc-500 dark:text-zinc-400">
                      {roleLabel(contact.role)}
                    </p>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
