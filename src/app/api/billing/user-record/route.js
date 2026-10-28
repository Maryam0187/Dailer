import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { loadUserMetricRecord } from "@/server/billing/userRecords";

export const runtime = "nodejs";

export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  try {
    const record = await loadUserMetricRecord({
      userId: body?.userId,
      fromDate: body?.fromDate,
      toDate: body?.toDate,
      managerId: body?.managerId,
    });
    return NextResponse.json({ record });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to load user record" },
      { status: err?.status || 400 },
    );
  }
}
