import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { getTwilioClient } from "@/server/twilio";
import { calculateTotals } from "@/server/billing/math";

export const runtime = "nodejs";

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function listCompletedCalls({ fromDate, toDate }) {
  const client = getTwilioClient();
  const after = new Date(fromDate);
  const before = new Date(toDate);
  before.setDate(before.getDate() + 1);

  const calls = await client.calls.list({
    startTimeAfter: after,
    startTimeBefore: before,
    status: "completed",
    pageSize: 1000,
  });

  return calls.filter((call) => {
    const twilioCost = Math.abs(Number(call.price));
    return Number.isFinite(twilioCost) && twilioCost > 0;
  });
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

  let calls;
  try {
    calls = await listCompletedCalls({ fromDate, toDate });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch usage from Twilio" },
      { status: 502 },
    );
  }

  const totals = calculateTotals(calls, settings.fixedMarkupPerCall);
  return NextResponse.json({
    preview: {
      fromDate,
      toDate,
      currency: settings.currency,
      fixedMarkupPerCall: Number(settings.fixedMarkupPerCall).toFixed(2),
      totalCalls: totals.totalCalls,
      twilioBaseAmount: totals.twilioBaseAmount,
      markupAmount: totals.markupAmount,
      totalAmount: totals.totalAmount,
    },
  });
}
