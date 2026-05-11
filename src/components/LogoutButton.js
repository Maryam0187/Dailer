"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    if (typeof window !== "undefined") {
      // Notify in-app listeners (Twilio Device teardown, etc.) before clearing auth cookie.
      window.dispatchEvent(new CustomEvent("auth:logout"));
      // Best-effort release of the dialer session lock BEFORE clearing the cookie,
      // so the release endpoint still authenticates and clears the DB row.
      try {
        const sid = window.sessionStorage.getItem("dialer:tabSessionId");
        if (sid) {
          await fetch("/api/session/release", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid }),
          });
        }
      } catch {
        /* non-fatal; sign-in route will also clear stale locks */
      }
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/sign-in");
  }

  return (
    <button
      onClick={onLogout}
      className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-base font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
    >
      Logout
    </button>
  );
}

