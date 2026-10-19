import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { previewDataRetention } from "@/server/admin/dataRetention";

export const runtime = "nodejs";

/**
 * GET /api/admin/data-retention/preview?beforeDate=YYYY-MM-DD&targets=callLogs,userActivities
 */
export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const beforeDate = searchParams.get("beforeDate");
    const targets = searchParams.get("targets");
    const preview = await previewDataRetention({ beforeDate, targets });
    return NextResponse.json(preview);
  } catch (err) {
    const status = err?.status === 400 ? 400 : 500;
    if (status === 500) {
      console.error("[admin/data-retention/preview]", err?.message || err);
    }
    return NextResponse.json(
      { error: status === 400 ? err.message : "Failed to preview data retention" },
      { status },
    );
  }
}
