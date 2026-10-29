import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { calculateUsageTotals, categoriesWithVoiceMarkup } from "@/server/billing/math";
import { writeBillPdf } from "@/server/billing/pdf";
import { listAccountUserRecords } from "@/server/billing/userRecords";
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
  const { authedUser, errorResponse } = await requireAdmin();
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
    (await db.BillingSetting.create({
      fixedMarkupPerCall: 0,
      programmableVoiceMarkupPercent: 0,
      currency: "USD",
      updatedBy: null,
    }));

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

  const totals = calculateUsageTotals(
    usageCategories,
    settings.fixedMarkupPerCall,
    settings.programmableVoiceMarkupPercent,
  );
  const invoiceCategories = categoriesWithVoiceMarkup(
    totals.categories,
    totals.programmableVoiceMarkupAmount,
  );

  let userRecords;
  try {
    userRecords = await listAccountUserRecords({
      fromDate,
      toDate,
      managerId: billingAccount.managerId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to load user records" },
      { status: err?.status || 400 },
    );
  }

  const tx = await db.sequelize.transaction();
  let committed = false;
  try {
    const bill = await db.Bill.create(
      {
        fromDate,
        toDate,
        currency: settings.currency,
        twilioBaseAmount: totals.twilioBaseAmount,
        fixedMarkupPerCall: Number(settings.fixedMarkupPerCall).toFixed(2),
        markupAmount: totals.markupAmount,
        programmableVoiceMarkupPercent: totals.programmableVoiceMarkupPercent,
        programmableVoiceMarkupAmount: totals.programmableVoiceMarkupAmount,
        totalCalls: totals.totalCalls,
        totalAmount: totals.totalAmount,
        usageBreakdown: invoiceCategories,
        userRecords,
        status: "generated",
        generatedBy: authedUser.id,
        managerId: billingAccount.managerId,
      },
      { transaction: tx },
    );

    const { storageKey } = await writeBillPdf({
      bill,
      usageCategories: invoiceCategories,
      userRecords,
      teamLabel: billingAccount.teamLabel,
    });
    await bill.update({ pdfPath: storageKey }, { transaction: tx });
    await tx.commit();
    committed = true;

    return NextResponse.json(
      {
        bill: {
          id: bill.id,
          fromDate: bill.fromDate,
          toDate: bill.toDate,
          currency: bill.currency,
          totalAmount: bill.totalAmount,
          categories: invoiceCategories,
          markupAmount: totals.markupAmount,
          programmableVoiceMarkupPercent: totals.programmableVoiceMarkupPercent,
          programmableVoiceMarkupAmount: totals.programmableVoiceMarkupAmount,
          userRecords,
          managerId: bill.managerId,
          managerUsername: billingAccount.managerUsername,
          teamLabel: billingAccount.teamLabel,
          accountScope: billingAccount.managerId ? "team" : "main",
          hasPdf: true,
          pdfUrl: `/api/billing/bills/${bill.id}/pdf`,
          createdAt: bill.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (!committed && tx.finished !== "commit") {
      try {
        await tx.rollback();
      } catch {
        // Ignore rollback errors when transaction is already finalized.
      }
    }
    return NextResponse.json(
      { error: err?.message || "Failed to generate bill PDF" },
      { status: 500 },
    );
  }
}
