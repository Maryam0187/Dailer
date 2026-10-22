import { NextResponse } from "next/server";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import {
  agentSelectsLeadSupervisor,
  countUnassignedSupervisorLeadsForAgent,
  getSameShiftSupervisorsForAgent,
} from "@/server/leads/leadAccess";

export async function GET() {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  if (!agentSelectsLeadSupervisor(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [supervisors, unassignedCount] = await Promise.all([
    getSameShiftSupervisorsForAgent(authedUser),
    countUnassignedSupervisorLeadsForAgent(authedUser.id),
  ]);

  return NextResponse.json({
    supervisors,
    unassignedCount,
  });
}
