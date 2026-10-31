import { redirect } from "next/navigation";
import AppointmentsClient from "@/components/Leads/AppointmentsClient";
import SignedInAs, { loadAssignedSupervisorName } from "@/components/layout/SignedInAs";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export default async function AppointmentsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");

  const supervisorName = await loadAssignedSupervisorName(authedUser);

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Appointments
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {authedUser.role === "admin"
            ? "Upcoming is every user’s appointment that is still ahead. All includes past appointments too."
            : "Upcoming is your appointments that are still ahead. All includes your past appointments too."}{" "}
          <SignedInAs
            username={authedUser.username}
            role={authedUser.role}
            supervisorName={supervisorName}
          />
        </p>
      </div>
      <AppointmentsClient />
    </>
  );
}
