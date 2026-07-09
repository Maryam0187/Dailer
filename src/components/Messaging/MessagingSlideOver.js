"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMessaging } from "@/contexts/MessagingContext";
import MessagingPanel from "./MessagingPanel";

function ExpandIcon({ className = "h-4.5 w-4.5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M13.75 3.5a.75.75 0 000 1.5h1.19l-4.72 4.72a.75.75 0 101.06 1.06l4.72-4.72v1.19a.75.75 0 001.5 0v-3a.75.75 0 00-.75-.75h-3zM6.25 16.5a.75.75 0 000-1.5H5.06l4.72-4.72a.75.75 0 10-1.06-1.06L4 13.94v-1.19a.75.75 0 00-1.5 0v3c0 .414.336.75.75.75h3z" />
    </svg>
  );
}

export default function MessagingSlideOver({ currentUserId, userRole = null }) {
  const { inboxOpen, closeInbox, activeConversationId, totalUnread } = useMessaging();

  useEffect(() => {
    if (!inboxOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") closeInbox();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inboxOpen, closeInbox]);

  if (!inboxOpen) return null;

  const messagesHref =
    activeConversationId != null
      ? `/messages?c=${activeConversationId}`
      : "/messages";

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[2px]"
        aria-label="Close messages"
        onClick={closeInbox}
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-zinc-200/90 bg-white shadow-2xl shadow-zinc-950/20 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/50 sm:max-w-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Messages"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 bg-gradient-to-r from-sky-50/90 via-white to-white px-3 py-3 dark:border-zinc-800 dark:from-sky-950/30 dark:via-zinc-950 dark:to-zinc-950 sm:px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Messages
              </h2>
              {totalUnread > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[10px] font-bold text-white">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Your personal inbox</p>
          </div>
          <div className="flex items-center gap-1">
            {userRole === "admin" ? (
              <Link
                href="/message-oversight"
                onClick={closeInbox}
                className="mr-0.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                title="Review all chats"
              >
                Oversight
              </Link>
            ) : null}
            <Link
              href={messagesHref}
              onClick={closeInbox}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Open full messages page"
              title="Open full page"
            >
              <ExpandIcon className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={closeInbox}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <MessagingPanel
            currentUserId={currentUserId}
            mode="slideover"
            onClose={closeInbox}
            hideMobileClose
          />
        </div>
      </aside>
    </div>
  );
}
