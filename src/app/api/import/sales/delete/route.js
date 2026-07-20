import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { deleteLegacyImportLead } from "@/server/import/runSalesImport";

export async function DELETE(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const leadId = Number(body?.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
  }

  const result = await deleteLegacyImportLead({ leadId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }

  return NextResponse.json(result);
}
