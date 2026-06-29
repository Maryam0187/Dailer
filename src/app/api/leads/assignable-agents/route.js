import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canUseLeadFilters } from "@/lib/leadRoles";
import { getFilterSupervisors, getLeadFilterCreators } from "@/server/leads/leadAccess";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canUseLeadFilters(authedUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [creators, supervisors] = await Promise.all([
    getLeadFilterCreators(authedUser),
    getFilterSupervisors(authedUser),
  ]);

  return NextResponse.json({
    supervisors: supervisors.map((s) => ({ id: s.id, username: s.username })),
    agents: creators,
  });
}
