import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { listLegacyImportLeads } from "@/server/import/runSalesImport";

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const scopeRaw = String(searchParams.get("scope") || "pending").toLowerCase();
  const scope = ["pending", "assigned", "all"].includes(scopeRaw) ? scopeRaw : "pending";
  const limit = Number(searchParams.get("limit") || 100);

  try {
    const result = await listLegacyImportLeads({ scope, limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/import/sales/unassigned]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load imported sales" },
      { status: 500 },
    );
  }
}
