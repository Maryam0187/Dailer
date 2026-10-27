import { NextResponse } from "next/server";
import db from "@/server/db";

export const runtime = "nodejs";

/**
 * Twilio AMD (Answering Machine Detection) callback for Sales Bot customer dials.
 * Form fields include AnsweredBy + CallSid.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const form = await req.formData().catch(() => null);
  const answeredBy = String(form?.get("AnsweredBy") || "").trim().toLowerCase();
  const callSid = String(form?.get("CallSid") || "").trim();

  if (!Number.isInteger(callId) || callId <= 0) {
    return new NextResponse("OK", { status: 200 });
  }

  try {
    const call = await db.CallLog.findByPk(callId, {
      attributes: ["id", "callKind", "dialMode", "answeredBy", "customerCallSid"],
    });
    if (!call) return new NextResponse("OK", { status: 200 });

    const updates = {};
    if (answeredBy) updates.answeredBy = answeredBy.slice(0, 32);
    if (callSid && !call.customerCallSid) updates.customerCallSid = callSid;
    if (Object.keys(updates).length) {
      await call.update(updates);
    }
  } catch (err) {
    console.error("[sales-bot] amd callback failed:", err?.message || err);
  }

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
