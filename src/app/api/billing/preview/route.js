import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { calculateUsageTotals } from "@/server/billing/math";
import {
  listBillingUsageForClient,
  resolveBillingTwilioClient,
} from "@/server/billing/twilioUsage";

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

  let billingAccount;
  try {
    billingAccount = await resolveBillingTwilioClient(body?.managerId);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Invalid billing account" },
      { status: err?.status || 400 },
    );
  }

  let usageCategories;
  try {
    usageCategories = await listBillingUsageForClient(billingAccount.client, {
      fromDate,
      toDate,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch usage from Twilio" },
      { status: 502 },
    );
  }

  const totals = calculateUsageTotals(usageCategories, settings.fixedMarkupPerCall);

  return NextResponse.json({
    preview: {
      fromDate,
      toDate,
      currency: settings.currency,
      totalAmount: totals.totalAmount,
      categories: totals.categories,
      managerId: billingAccount.managerId,
      managerUsername: billingAccount.managerUsername,
      accountScope: billingAccount.managerId ? "team" : "main",
    },
  });
}
