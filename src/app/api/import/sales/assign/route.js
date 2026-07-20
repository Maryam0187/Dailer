import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { assignLegacyLeadToAgent } from "@/server/import/runSalesImport";

export async function POST(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const leadId = Number(body?.leadId);
  const agentUserId = Number(body?.agentUserId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
  }
  if (!Number.isInteger(agentUserId) || agentUserId <= 0) {
    return NextResponse.json({ error: "Invalid agentUserId" }, { status: 400 });
  }

  const result = await assignLegacyLeadToAgent({
    leadId,
    agentUserId,
    adminUserId: authedUser.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }

  return NextResponse.json(result);
}
