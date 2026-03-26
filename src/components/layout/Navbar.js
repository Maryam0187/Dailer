"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/theme/ThemeToggle";
import DialerPhoneIcon from "@/components/brand/DialerPhoneIcon";

export default function Navbar({ role }) {
  const pathname = usePathname();
  const onDialerPage = pathname === "/";
  const onUsersPage = pathname === "/users";

  return (
    <header className="sticky top-0 z-30 border-b-2 border-sky-500/20 bg-gradient-to-r from-sky-100/70 via-white to-sky-50/70 backdrop-blur-md dark:border-sky-500/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-lg font-semibold outline-none ring-sky-400/40 transition-[box-shadow,background-color,border-color] focus-visible:ring-2 ${
              onDialerPage
                ? "border-sky-500/70 bg-sky-100 text-sky-950 shadow-md shadow-sky-500/25 dark:border-sky-500/55 dark:bg-sky-950/45 dark:text-sky-50 dark:shadow-sky-950/35"
                : "border-sky-200/90 bg-sky-50/70 text-zinc-950 shadow-sm shadow-sky-500/10 hover:bg-sky-50 hover:shadow-md dark:border-sky-900/50 dark:bg-zinc-900/80 dark:text-zinc-100 dark:shadow-sky-950/20 dark:hover:bg-zinc-900"
            }`}
            aria-label="Dialer — home"
            aria-current={onDialerPage ? "page" : undefined}
          >
            <DialerPhoneIcon className="h-7 w-7" />
            <span>Dialer</span>
          </Link>
          {role === "admin" || role === "manager" ? (
            <Link
              href="/users"
              className={`rounded-xl border px-3 py-2 text-base font-semibold transition-colors ${
                onUsersPage
                  ? "border-emerald-500/70 bg-emerald-100 text-emerald-950 shadow-md shadow-emerald-500/20 dark:border-emerald-500/55 dark:bg-emerald-950/45 dark:text-emerald-50 dark:shadow-emerald-950/30"
                  : "border-transparent text-emerald-700 hover:border-emerald-200/90 hover:bg-emerald-50/90 hover:text-emerald-950 dark:text-emerald-400 dark:hover:border-emerald-800/80 dark:hover:bg-emerald-950/35 dark:hover:text-emerald-100"
              }`}
              aria-current={onUsersPage ? "page" : undefined}
            >
              Users
            </Link>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/60 px-2 py-1.5 dark:border-zinc-600/80 dark:bg-zinc-800/40 sm:gap-3 sm:px-3">
          <ThemeToggle />
          <span className="rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-sm font-semibold capitalize text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
            {role}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
