"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    if (typeof window !== "undefined") {
      // Notify in-app listeners (Twilio Device teardown, etc.) before clearing the cookie.
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/sign-in");
  }

  return (
    <button
      onClick={onLogout}
      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:px-4 sm:py-2.5 sm:text-base dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
    >
      Logout
    </button>
  );
}
