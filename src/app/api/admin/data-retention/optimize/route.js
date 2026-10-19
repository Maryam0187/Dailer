import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { optimizeRetentionTables } from "@/server/admin/dataRetention";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/data-retention/optimize
 * Body: { targets: ["callLogs","userActivities"] }
 */
export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json().catch(() => null);
    const result = await optimizeRetentionTables({ targets: body?.targets });
    return NextResponse.json(result);
  } catch (err) {
    const status = err?.status === 400 ? 400 : 500;
    if (status === 500) {
      console.error("[admin/data-retention/optimize]", err?.message || err);
    }
    return NextResponse.json(
      { error: status === 400 ? err.message : "Failed to optimize tables" },
      { status },
    );
  }
}
