import { NextResponse } from "next/server";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { canUseLeadFilters } from "@/lib/leadRoles";
import { getFilterSupervisors, getLeadFilterCreators } from "@/server/leads/leadAccess";

export async function GET() {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  if (!canUseLeadFilters(authedUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [creators, supervisors] = await Promise.all([
    getLeadFilterCreators(authedUser),
    getFilterSupervisors(authedUser),
  ]);

  return NextResponse.json({
    supervisors: supervisors.map((s) => ({
      id: s.id,
      username: s.username,
      shiftKey: s.shiftKey === "night" ? "night" : "day",
    })),
    agents: creators,
  });
}
