import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { aggregateLeadMetrics } from "@/server/leads/aggregateLeadMetrics";

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export async function GET(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const { agents, agentTotals } = await aggregateLeadMetrics({
    authedUser,
    fromDate,
    toDate,
  });

  return NextResponse.json({
    fromDate,
    toDate,
    agents,
    agentTotals,
  });
}
