"use client";

import { useEffect, useMemo, useState } from "react";
import { roleLabel } from "./presence";

const MAX_BODY = 5000;
const MAX_RECIPIENTS = 100;

export default function MessageBroadcastClient() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        String(c.username || "")
          .toLowerCase()
          .includes(q) ||
        String(c.role || "")
          .toLowerCase()
          .includes(q) ||
        String(roleLabel(c.role) || "")
          .toLowerCase()
          .includes(q),
    );
  }, [contacts, search]);

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedIds.has(c.id)),
    [contacts, selectedIds],
  );

  const trimmedBody = body.trim();
  const canSubmit =
    !loading && !sending && selectedIds.size > 0 && selectedIds.size <= MAX_RECIPIENTS && trimmedBody.length > 0;

  function toggleUser(userId, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= MAX_RECIPIENTS && !next.has(userId)) return prev;
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
    setResult(null);
  }

  function selectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filtered) {
        if (next.size >= MAX_RECIPIENTS) break;
        next.add(c.id);
      }
      return next;
    });
    setResult(null);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setResult(null);
  }

  async function sendBroadcast() {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/messages/broadcast", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          recipientUserIds: [...selectedIds],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send broadcast");
        return;
      }
      setResult({
        sent: Array.isArray(data.sent) ? data.sent : [],
        failed: Array.isArray(data.failed) ? data.failed : [],
      });
      setConfirmOpen(false);
      if (Array.isArray(data.sent) && data.sent.length > 0) {
        setBody("");
        setSelectedIds(new Set());
      }
    } catch {
      setError("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  }

  const usernameById = useMemo(() => {
    const map = new Map();
    for (const c of contacts) map.set(c.id, c.username);
    return map;
  }, [contacts]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recipients</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {selectedIds.size} selected
              {selectedIds.size > 0 ? ` (max ${MAX_RECIPIENTS})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={loading || filtered.length === 0}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Clear
            </button>
          </div>
        </div>

        <label htmlFor="broadcast-search" className="sr-only">
          Search contacts
        </label>
        <input
          id="broadcast-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or role…"
          autoComplete="off"
          className="mt-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />

        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
          {loading ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">Loading contacts…</p>
          ) : contacts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">No contacts available.</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              No contacts match “{search.trim()}”.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((user) => {
                const checked = selectedIds.has(user.id);
                return (
                  <li key={user.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleUser(user.id, e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{user.username}</span>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {roleLabel(user.role)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selectedContacts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedContacts.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleUser(user.id, false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-950"
                title="Remove"
              >
                {user.username}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label htmlFor="broadcast-body" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Message
        </label>
        <textarea
          id="broadcast-body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, MAX_BODY));
            setResult(null);
          }}
          rows={6}
          placeholder="Write the message to send to every selected recipient…"
          className="mt-3 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {trimmedBody.length}/{MAX_BODY}
          </p>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send to {selectedIds.size || "…"} {selectedIds.size === 1 ? "user" : "users"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Result</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Sent to {result.sent.length}
            {result.failed.length > 0 ? ` · Failed: ${result.failed.length}` : ""}
          </p>
          {result.failed.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-rose-700 dark:text-rose-300">
              {result.failed.map((item) => (
                <li key={item.userId}>
                  {usernameById.get(item.userId) || `User #${item.userId}`}: {item.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {confirmOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={() => !sending && setConfirmOpen(false)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="broadcast-confirm-title"
              className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
            >
              <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
                <h3
                  id="broadcast-confirm-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Send to {selectedIds.size} users?
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Each recipient gets the same message in their DM with you. This cannot be undone
                  in bulk.
                </p>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendBroadcast()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
