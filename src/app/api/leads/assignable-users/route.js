import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAssignLeadsLikeLeadSupervisor } from "@/lib/leadRoles";
import {
  getAdminAssignableUsersForAssignment,
  getLeadSupervisorAssignableUsersForAssignment,
} from "@/server/leads/leadAccess";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (authedUser.role === "admin") {
    const users = await getAdminAssignableUsersForAssignment();
    return NextResponse.json({ users });
  }

  if (canAssignLeadsLikeLeadSupervisor(authedUser.role)) {
    const users = await getLeadSupervisorAssignableUsersForAssignment(authedUser);
    return NextResponse.json({ users });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
