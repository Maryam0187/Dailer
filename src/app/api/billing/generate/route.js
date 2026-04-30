import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { getTwilioClient } from "@/server/twilio";
import { calculateTotals } from "@/server/billing/math";
import { writeBillPdf } from "@/server/billing/pdf";

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

  return calls.filter((call) => Number.isFinite(Math.abs(Number(call.price))));
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

  const duplicate = await db.Bill.findOne({
    where: {
      fromDate: { [Op.eq]: fromDate },
      toDate: { [Op.eq]: toDate },
    },
    order: [["createdAt", "DESC"]],
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Bill already exists for this exact date range" },
      { status: 409 },
    );
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

  const tx = await db.sequelize.transaction();
  try {
    const bill = await db.Bill.create(
      {
        fromDate,
        toDate,
        currency: settings.currency,
        twilioBaseAmount: totals.twilioBaseAmount,
        fixedMarkupPerCall: Number(settings.fixedMarkupPerCall).toFixed(2),
        markupAmount: totals.markupAmount,
        totalCalls: totals.totalCalls,
        totalAmount: totals.totalAmount,
        status: "generated",
        generatedBy: authedUser.id,
      },
      { transaction: tx },
    );

    const localLogs = totals.lines.length
      ? await db.CallLog.findAll({
          where: { twilioSid: totals.lines.map((line) => line.twilioSid) },
          attributes: ["id", "twilioSid"],
          transaction: tx,
        })
      : [];

    const logBySid = new Map(localLogs.map((log) => [log.twilioSid, log.id]));

    const items = totals.lines.map((line) => ({
      billId: bill.id,
      callLogId: logBySid.get(line.twilioSid) || null,
      twilioSid: line.twilioSid,
      toNumber: line.toNumber,
      fromNumber: line.fromNumber,
      durationSeconds: line.durationSeconds,
      twilioCost: line.twilioCost,
      markupApplied: line.markupApplied,
      lineAmount: line.lineAmount,
    }));

    await db.BillItem.bulkCreate(items, { transaction: tx });
    await tx.commit();

    const pdfPath = await writeBillPdf({ bill, items });
    bill.pdfPath = pdfPath;
    await bill.save();

    return NextResponse.json(
      {
        bill: {
          id: bill.id,
          fromDate: bill.fromDate,
          toDate: bill.toDate,
          currency: bill.currency,
          twilioBaseAmount: bill.twilioBaseAmount,
          fixedMarkupPerCall: bill.fixedMarkupPerCall,
          markupAmount: bill.markupAmount,
          totalCalls: bill.totalCalls,
          totalAmount: bill.totalAmount,
          pdfUrl: `/api/billing/bills/${bill.id}/pdf`,
          createdAt: bill.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
