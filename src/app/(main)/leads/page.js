import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import LeadsClient from "@/components/Leads/LeadsClient";
import SignedInAs, { loadAssignedSupervisorName } from "@/components/layout/SignedInAs";

export default async function LeadsPage({ searchParams }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");

  const sp = searchParams && typeof searchParams.then === "function" ? await searchParams : searchParams;
  const initialShowForm = sp?.new === "1";
  const supervisorName = await loadAssignedSupervisorName(authedUser);

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Leads</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          <SignedInAs
            username={authedUser.username}
            role={authedUser.role}
            supervisorName={supervisorName}
          />
        </p>
      </div>
      <LeadsClient
        initialShowForm={initialShowForm}
        userRole={authedUser.role}
        currentUserId={authedUser.id}
        isOutside={Boolean(authedUser.isOutside)}
        canReceiveSharedLeads={Boolean(authedUser.canReceiveSharedLeads)}
      />
    </>
  );
}
