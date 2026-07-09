"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PresenceDot } from "./presence";

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
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-700">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">New message</h2>
      </div>

      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people…"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-sky-400/40 placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      {error ? (
        <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Loading contacts…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No matching users.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void openWith(contact.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-zinc-50 disabled:opacity-60 dark:hover:bg-zinc-900/60"
                >
                  <PresenceDot status={contact.presence} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {contact.username}
                    </p>
                    <p className="text-xs capitalize text-zinc-500 dark:text-zinc-400">
                      {String(contact.role || "").replace("_", " ")}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
