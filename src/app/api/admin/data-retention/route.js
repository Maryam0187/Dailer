import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { purgeDataRetention } from "@/server/admin/dataRetention";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/data-retention
 * Body: { beforeDate, targets, confirm: "DELETE" }
 */
export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json().catch(() => null);
    const result = await purgeDataRetention({
      beforeDate: body?.beforeDate,
      targets: body?.targets,
      confirm: body?.confirm,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err?.status === 400 ? 400 : 500;
    if (status === 500) {
      console.error("[admin/data-retention]", err?.message || err);
    }
    return NextResponse.json(
      { error: status === 400 ? err.message : "Failed to purge data" },
      { status },
    );
  }
}
