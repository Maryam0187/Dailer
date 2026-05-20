import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { aggregateMetricsByUser } from "@/server/calls/aggregateMetrics";

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const conferenceOnly = scope === "conference";
  const callKind = scope === "cold" ? "cold" : scope === "lead" ? "lead" : null;
  const includeAllUsers =
    String(searchParams.get("includeAllUsers") || "").trim() === "1" ||
    String(searchParams.get("includeAllUsers") || "").trim().toLowerCase() === "true";

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const { metrics, totals } = await aggregateMetricsByUser({
    fromDate,
    toDate,
    conferenceOnly,
    callKind,
    includeAllUsers,
    excludeAdmin: true,
  });

  return NextResponse.json({ fromDate, toDate, scope, metrics, totals });
}
