import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import MessageOversightClient from "@/components/Messaging/MessageOversightClient";

export default async function MessageOversightPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");
  if (authedUser.role !== "admin") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-amber-200/70 pb-5 dark:border-amber-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Admin only
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Chat oversight
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Review any teammate DM. This view is read-only — use your personal inbox icon to send
          your own messages.
        </p>
      </div>
      <MessageOversightClient currentUserId={authedUser.id} />
    </>
  );
}
