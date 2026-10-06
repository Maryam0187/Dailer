import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import MessageBroadcastClient from "@/components/Messaging/MessageBroadcastClient";

export default async function MessageBroadcastPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");
  if (authedUser.role !== "admin" && authedUser.role !== "manager") redirect("/");

  const isAdmin = authedUser.role === "admin";

  return (
    <>
      <div className="mb-6 border-b border-amber-200/70 pb-5 dark:border-amber-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {isAdmin ? "Admin" : "Manager"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Broadcast message
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Send the same message to multiple teammates as separate DMs.
          {!isAdmin
            ? " You can only reach contacts you can already message."
            : null}
        </p>
      </div>
      <MessageBroadcastClient />
    </>
  );
}
