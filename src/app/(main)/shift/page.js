import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import ShiftSettingsClient from "@/components/Shift/ShiftSettingsClient";
import LeaveApplicationsAdmin from "@/components/Shift/LeaveApplicationsAdmin";

export default async function ShiftPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Shift timing
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Configure day and night shifts separately. Assign each agent to one shift on the Users page.
          Admins can always sign in and manage both. After-shift access also works on leave days and when a
          shift is ended.
        </p>
      </div>
      <ShiftSettingsClient />
      <div className="mt-8">
        <LeaveApplicationsAdmin />
      </div>
    </>
  );
}
