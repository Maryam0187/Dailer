import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { backfillAllCallDailyMetrics } from "@/server/calls/callDailyMetrics";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/data-retention/backfill
 * Rebuild CallDailyMetrics from all CallLogs (date-wise report rollups).
 */
export async function POST() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const result = await backfillAllCallDailyMetrics();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin/data-retention/backfill]", err?.message || err);
    return NextResponse.json({ error: "Failed to backfill call daily metrics" }, { status: 500 });
  }
}
