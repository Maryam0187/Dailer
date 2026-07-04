"use client";

import { useRouter } from "next/navigation";
import { useActiveCall } from "@/contexts/ActiveCallContext";

function hasActiveLocalCall(session) {
  const callId = Number(session?.callId);
  return Number.isInteger(callId) && callId > 0;
}

export default function LogoutButton() {
  const router = useRouter();
  const { session } = useActiveCall();

  async function onLogout() {
    if (hasActiveLocalCall(session)) {
      window.alert("You cannot sign out while on an active call. End the call first.");
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }

    const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(json?.error || "Could not sign out.");
      return;
    }
    router.push("/sign-in");
  }

  return (
    <button
      onClick={() => void onLogout()}
      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:px-4 sm:py-2.5 sm:text-base dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
    >
      Logout
    </button>
  );
}
