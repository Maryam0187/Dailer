import { NextResponse } from "next/server";
import {
  applyCallLegUpdate,
  findCallLogByAnyLegSid,
  parseDurationSeconds,
  syncCustomerLegFromTwilio,
} from "@/server/calls/callLegs";
import { emitCustomerCallStatus } from "@/server/calls/emitCustomerStatus";
export const runtime = "nodejs";

function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "unknown";
  return status.toLowerCase();
}

export async function POST(req) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") || "").trim();
  const callStatus = form.get("CallStatus");
  const callDuration = form.get("CallDuration");
  const normalizedStatus = normalizeStatus(callStatus);

  if (!callSid) {
    return NextResponse.json({ error: "CallSid is required" }, { status: 400 });
  }

  const call = await findCallLogByAnyLegSid(callSid);
  if (!call) {
    return new NextResponse("OK", { status: 200 });
  }

  const parentSid = String(call.twilioSid || "").trim();
  const customerFirst = String(call.dialMode || "").trim().toLowerCase() === "customer_first";
  const isCustomer = customerFirst ? callSid === parentSid : callSid !== parentSid;

  await applyCallLegUpdate(call, {
    source: "twilio-status",
    leg: isCustomer ? "customer" : "agent",
    callSid: isCustomer ? undefined : callSid,
    status: normalizedStatus,
    durationSeconds: parseDurationSeconds(callDuration),
  });

  if (isCustomer && normalizedStatus !== "unknown") {
    emitCustomerCallStatus(call, {
      status: normalizedStatus,
      callSid,
      durationSeconds: parseDurationSeconds(callDuration),
      source: "twilio-status",
    });
  }

  if (normalizedStatus === "completed") {
    const refreshed = await findCallLogByAnyLegSid(callSid);
    if (refreshed) await syncCustomerLegFromTwilio(refreshed);
  }

  return new NextResponse("OK", { status: 200 });
}
