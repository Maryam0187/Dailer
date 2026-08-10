"use client";

import { useCallback, useEffect, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { ivrAssociateLabel, ivrChoiceLabel } from "@/lib/ivrChoiceLabel";
import IvrCustomerMatchRow from "@/components/Ivr/IvrCustomerMatchRow";

function eventLabel(type) {
  if (type === "incoming") return "Incoming";
  if (type === "gather") return "Gather update";
  if (type === "ringing") return "Ringing admin";
  return type || "Update";
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IvrNotificationsClient() {
  const [rows, setRows] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/ivr/notifications", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load notifications");
      setRows(Array.isArray(json.notifications) ? json.notifications : []);
      setUnreadCount(Number(json.unreadCount) || 0);
    } catch (err) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("ivr:alert", () => {
      void load();
    });

    return () => socket.disconnect();
  }, [load]);

  async function markRead(ids, markAll = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ivr/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(markAll ? { markAll: true } : { ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update");
      setUnreadCount(Number(json.unreadCount) || 0);
      if (markAll) {
        setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt || new Date().toISOString() })));
      } else {
        const idSet = new Set(ids);
        setRows((prev) =>
          prev.map((r) => (idSet.has(r.id) ? { ...r, readAt: r.readAt || new Date().toISOString() } : r)),
        );
      }
    } catch (err) {
      setError(err?.message || "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {unreadCount > 0 ? (
            <>
              <span className="font-semibold text-sky-700 dark:text-sky-300">{unreadCount} unread</span>
              {" · "}
            </>
          ) : null}
          Inbound IVR calls and gather answers (live).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void markRead([], true)}
            disabled={busy || unreadCount === 0}
            className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            Mark all read
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No IVR notifications yet. When a caller hits your Studio flow, they appear here.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          {rows.map((row) => {
            const unread = !row.readAt;
            return (
              <li
                key={row.id}
                className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${
                  unread ? "bg-sky-50/70 dark:bg-sky-950/20" : ""
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {unread ? (
                      <span className="inline-flex rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        New
                      </span>
                    ) : null}
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {row.fromNumber || "Unknown caller"}
                    </span>
                    <span className="text-xs text-zinc-500">{eventLabel(row.lastEventType)}</span>
                  </div>
                  {row.customer ? (
                    <IvrCustomerMatchRow
                      label="Caller"
                      customer={{
                        ...row.customer,
                        phone: row.fromNumber || row.customer.phone,
                      }}
                    />
                  ) : null}
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Choice: {ivrChoiceLabel(row.choice, { empty: "—", prefix: false })}
                    {(() => {
                      const assoc = ivrAssociateLabel(row.associate, { empty: null });
                      return assoc ? ` · ${assoc}` : "";
                    })()}
                    {row.numberEntered ? ` · Number: ${row.numberEntered}` : ""}
                  </p>
                  <IvrCustomerMatchRow label="Associate match" customer={row.associateCustomer} />
                  <p className="text-xs text-zinc-500">
                    To {row.toNumber || "—"} · Updated {formatWhen(row.updatedAt || row.createdAt)}
                    {row.callSid ? ` · ${row.callSid}` : ""}
                  </p>
                </div>
                {unread ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markRead([row.id])}
                    className="shrink-0 self-start rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-white disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Mark read
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
