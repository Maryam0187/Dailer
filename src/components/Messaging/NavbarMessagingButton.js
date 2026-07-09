"use client";

import { useMessaging } from "@/contexts/MessagingContext";

export default function NavbarMessagingButton() {
  const { totalUnread, inboxOpen, openInbox, closeInbox } = useMessaging();

  return (
    <button
      type="button"
      onClick={() => (inboxOpen ? closeInbox() : openInbox())}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      aria-label={totalUnread > 0 ? `Messages, ${totalUnread} unread` : "Messages"}
      title="Messages"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z"
          clipRule="evenodd"
        />
      </svg>
      {totalUnread > 0 ? (
        <span className="absolute -right-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-800">
          {totalUnread > 99 ? "99+" : totalUnread}
        </span>
      ) : null}
    </button>
  );
}
