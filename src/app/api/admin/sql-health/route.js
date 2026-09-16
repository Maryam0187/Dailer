import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { collectSqlHealth } from "@/server/admin/sqlHealth";

export const runtime = "nodejs";

/**
 * GET /api/admin/sql-health
 * Read-only MySQL status / table sizes / optional statement digests (admin only).
 */
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const health = await collectSqlHealth();
    return NextResponse.json(health);
  } catch (err) {
    console.error("[admin/sql-health]", err?.message || err);
    return NextResponse.json({ error: "Failed to collect SQL health" }, { status: 500 });
  }
}
