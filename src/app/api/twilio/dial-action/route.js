import { NextResponse } from "next/server";
import db from "@/server/db";
import { applyCallLegUpdate, parseDurationSeconds } from "@/server/calls/callLegs";

export const runtime = "nodejs";

/**
 * &lt;Dial action="..."&gt; — fired when the customer leg ends; captures DialCallSid + duration.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const form = await req.formData();
  const dialCallSid = String(form.get("DialCallSid") || "").trim();
  const dialCallStatus = String(form.get("DialCallStatus") || "").trim();
  const dialCallDuration = form.get("DialCallDuration");

  if (!Number.isInteger(callId) || callId <= 0) {
    return new NextResponse("", { status: 200 });
  }

  const call = await db.CallLog.findByPk(callId);
  if (!call) return new NextResponse("", { status: 200 });

  if (dialCallSid) {
    await applyCallLegUpdate(call, {
      source: "dial-action",
      leg: "customer",
      callSid: dialCallSid,
      status: dialCallStatus || undefined,
      durationSeconds: parseDurationSeconds(dialCallDuration),
    });
  }

  return new NextResponse("", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
