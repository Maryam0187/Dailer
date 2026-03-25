import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function Navbar({ role }) {
  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-red-600"
              fill="currentColor"
              aria-hidden
            >
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
            Dialer
          </Link>
          {role === "admin" || role === "manager" ? (
            <Link
              href="/users"
              className="text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              Users
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">{role}</span>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

