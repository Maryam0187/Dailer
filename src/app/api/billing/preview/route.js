import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";

export const runtime = "nodejs";

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const fromDate = normalizeDate(body?.fromDate);
  const toDate = normalizeDate(body?.toDate);
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before toDate" }, { status: 400 });
  }

  const settings =
    (await db.BillingSetting.findOne({ order: [["id", "DESC"]] })) ||
    (await db.BillingSetting.create({ fixedMarkupPerCall: 0, currency: "USD", updatedBy: null }));

  return NextResponse.json({
    preview: {
      fromDate,
      toDate,
      currency: settings.currency,
      fixedMarkupPerCall: Number(settings.fixedMarkupPerCall).toFixed(2),
    },
  });
}
