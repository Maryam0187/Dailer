"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { io as ioClient } from "socket.io-client";

export default function NavbarInboundBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ivr/notifications?countOnly=1", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setUnreadCount(Number(json.unreadCount) || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("ivr:alert", () => {
      setUnreadCount((n) => n + 1);
      void refresh();
    });

    return () => socket.disconnect();
  }, [refresh]);

  return (
    <Link
      href="/ivr-notifications"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      aria-label={
        unreadCount > 0
          ? `Inbound callbacks, ${unreadCount} unread`
          : "Inbound callback notifications"
      }
      title="Inbound / callback notifications"
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
          d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.25.9-5.071.9H8.5c-1.821 0-3.527-.33-5.071-.9a.75.75 0 01-.297-1.206A8.232 8.232 0 005.25 9.75V9zm4.022 9.75a2.25 2.25 0 004.456 0H9.272z"
          clipRule="evenodd"
        />
      </svg>
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-800">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
