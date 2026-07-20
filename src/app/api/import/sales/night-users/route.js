import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { listNightShiftAgents } from "@/server/import/runSalesImport";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const users = await listNightShiftAgents();
  return NextResponse.json({ users });
}
