import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function Navbar({ role }) {
  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
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

