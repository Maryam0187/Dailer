import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { getCallDailyMetricsCoverage } from "@/server/calls/callDailyMetrics";

export const runtime = "nodejs";

/**
 * GET /api/admin/data-retention/coverage
 */
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const coverage = await getCallDailyMetricsCoverage();
    return NextResponse.json(coverage);
  } catch (err) {
    console.error("[admin/data-retention/coverage]", err?.message || err);
    return NextResponse.json({ error: "Failed to load coverage" }, { status: 500 });
  }
}
