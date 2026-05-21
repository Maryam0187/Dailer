import { NextResponse } from "next/server";
import db from "@/server/db";
import { applyCallLegUpdate, parseDurationSeconds } from "@/server/calls/callLegs";

export const runtime = "nodejs";

/**
 * StatusCallback on &lt;Client&gt; under customer-first cold dial.
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

  await applyCallLegUpdate(call, {
    source: "agent-leg-status",
    leg: "agent",
    callSid,
    status: callStatus || undefined,
    durationSeconds: parseDurationSeconds(callDuration),
  });

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
