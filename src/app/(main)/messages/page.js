import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import MessagesClient from "@/components/Messaging/MessagesClient";

export default async function MessagesPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-sky-200/60 pb-5 dark:border-sky-900/40">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Messages
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Chat with teammates in real time. Use the inbox icon in the header for a quick slide-over.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-[min(72vh,760px)] animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        }
      >
        <MessagesClient currentUserId={authedUser.id} />
      </Suspense>
    </>
  );
}
