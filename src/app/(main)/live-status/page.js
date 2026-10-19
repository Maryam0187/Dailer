import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessLiveStatus } from "@/server/auth/userAccess";
import { getLiveAgentStatus } from "@/server/calls/liveAgentStatus";
import LiveStatusClient from "@/components/LiveStatus/LiveStatusClient";
import SignedInAs from "@/components/layout/SignedInAs";

const ADMIN_ROLES = ["agent", "supervisor", "lead_supervisor", "manager", "processor"];
const MANAGER_TEAM_ROLES = ["agent", "supervisor", "processor", "lead_supervisor"];

export default async function LiveStatusPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (!canAccessLiveStatus(authedUser)) redirect("/");

  const isAdmin = authedUser.role === "admin";
  const initial = await getLiveAgentStatus({
    roles: isAdmin ? ADMIN_ROLES : MANAGER_TEAM_ROLES,
    managerId: isAdmin ? null : authedUser.id,
  });

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Live status
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {isAdmin
            ? "Who is online, who is on a call, and each agent’s last call time."
            : "Live presence and call status for your team."}{" "}
          <SignedInAs username={authedUser.username} role={authedUser.role} />
        </p>
      </div>
      <LiveStatusClient
        initialAgents={initial.agents}
        initialManagers={isAdmin ? initial.managers || [] : []}
        viewerRole={authedUser.role}
      />
    </>
  );
}
