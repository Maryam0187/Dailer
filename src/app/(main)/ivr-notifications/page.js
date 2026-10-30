import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import IvrNotificationsClient from "@/components/Ivr/IvrNotificationsClient";
import IvrAffinitySettingsAdmin from "@/components/Ivr/IvrAffinitySettingsAdmin";

export default async function IvrNotificationsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  const isAdmin = authedUser.role === "admin";

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          {isAdmin ? "Inbound / IVR notifications" : "Callback notifications"}
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {isAdmin
            ? "All inbound local and toll-free callbacks. Live updates while you are logged in."
            : "Inbound callbacks related to your recent calls or leads. Ask an admin when a lead is already in the system."}
        </p>
      </div>
      {isAdmin ? <IvrAffinitySettingsAdmin /> : null}
      <IvrNotificationsClient isAdmin={isAdmin} />
    </>
  );
}
