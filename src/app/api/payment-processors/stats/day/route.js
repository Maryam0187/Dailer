import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { listPaymentChargeDayDetails, normalizePaymentKind } from "@/server/paymentProcessors/stats";

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const date = String(searchParams.get("date") || "").trim();
  const processorRaw = String(searchParams.get("processor") || "").trim().toLowerCase();
  const processor = !processorRaw || processorRaw === "all" ? null : processorRaw;
  const kind = normalizePaymentKind(searchParams.get("kind"));

  if (!isValidDateInput(date)) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (processor && !/^[a-z0-9_]{1,64}$/.test(processor)) {
    return NextResponse.json({ error: "Invalid payment processor" }, { status: 400 });
  }

  const detail = await listPaymentChargeDayDetails({ date, processor, kind });
  return NextResponse.json(detail);
}
