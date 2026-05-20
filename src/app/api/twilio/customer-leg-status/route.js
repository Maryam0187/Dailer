import { NextResponse } from "next/server";
import db from "@/server/db";
import { applyCallLegUpdate, parseDurationSeconds } from "@/server/calls/callLegs";
import { emitCustomerCallStatus } from "@/server/calls/emitCustomerStatus";

export const runtime = "nodejs";

/**
 * StatusCallback on &lt;Number&gt; — updates customer (PSTN dial) leg sid + duration.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const form = await req.formData();
  const callSid = String(form.get("CallSid") || "").trim();
  const callStatus = String(form.get("CallStatus") || "").trim();
  const callDuration = form.get("CallDuration");

  if (!Number.isInteger(callId) || callId <= 0 || !callSid) {
    return new NextResponse("OK", { status: 200 });
  }

  const call = await db.CallLog.findByPk(callId);
  if (!call) return new NextResponse("OK", { status: 200 });

  const normalizedStatus = String(callStatus || "").trim().toLowerCase();

  await applyCallLegUpdate(call, {
    source: "customer-leg-status",
    leg: "customer",
    callSid,
    status: normalizedStatus || undefined,
    durationSeconds: parseDurationSeconds(callDuration),
  });

  if (normalizedStatus) {
    emitCustomerCallStatus(call, {
      status: normalizedStatus,
      callSid,
      durationSeconds: parseDurationSeconds(callDuration),
      source: "customer-leg-status",
    });
  }

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
