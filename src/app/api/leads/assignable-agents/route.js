import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getAssignableAgents, getFilterSupervisors } from "@/server/leads/leadAccess";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (
    authedUser.role !== "admin" &&
    authedUser.role !== "manager" &&
    authedUser.role !== "supervisor"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [agents, supervisors] = await Promise.all([
    getAssignableAgents(authedUser),
    getFilterSupervisors(authedUser),
  ]);

  return NextResponse.json({
    supervisors: supervisors.map((s) => ({ id: s.id, username: s.username })),
    agents: agents.map((a) => ({
      id: a.id,
      username: a.username,
      supervisorId: a.supervisorId ?? null,
    })),
  });
}
