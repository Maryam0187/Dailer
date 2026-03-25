"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
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

