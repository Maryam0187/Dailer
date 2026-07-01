import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { aggregateFileMetrics } from "@/server/files/aggregateFileMetrics";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { users, totals } = await aggregateFileMetrics();

  return NextResponse.json({ users, totals });
}
