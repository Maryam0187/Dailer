import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import AdminPushDevicesClient from "@/components/Push/AdminPushDevicesClient";

export default async function PushSubscriptionsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Push subscriptions
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          All dialer users and their OneSignal web push devices (External ID{" "}
          <code className="text-sm">username_id</code>).
        </p>
      </div>
      <AdminPushDevicesClient />
    </>
  );
}
