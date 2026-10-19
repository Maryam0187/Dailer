import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessLiveStatus } from "@/server/auth/userAccess";
import { getLiveAgentStatus } from "@/server/calls/liveAgentStatus";

const ADMIN_ROLES = ["agent", "supervisor", "lead_supervisor", "manager", "processor"];
const MANAGER_TEAM_ROLES = ["agent", "supervisor", "processor", "lead_supervisor"];

/** Live agent board: presence, on-call, last call. Admin or in-house manager. */
export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessLiveStatus(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const isAdmin = authedUser.role === "admin";
    const payload = await getLiveAgentStatus({
      roles: isAdmin ? ADMIN_ROLES : MANAGER_TEAM_ROLES,
      managerId: isAdmin ? null : authedUser.id,
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[live-status]", err?.message || err);
    return NextResponse.json({ error: "Failed to load live status" }, { status: 500 });
  }
}
