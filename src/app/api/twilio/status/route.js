import { NextResponse } from "next/server";
import {
  applyCallLegUpdate,
  findCallLogByAnyLegSid,
  parseDurationSeconds,
  syncCustomerLegFromTwilio,
} from "@/server/calls/callLegs";
import { logCallStatus } from "@/server/calls/callStatusLog";

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
    logCallStatus({
      source: "twilio-status",
      callSid,
      status: normalizedStatus,
      durationSeconds: parseDurationSeconds(callDuration),
      extra: { note: "no_matching_call_log" },
    });
    return new NextResponse("OK", { status: 200 });
  }

  const agentSid = String(call.twilioSid || "").trim();
  const isCustomer = callSid !== agentSid;

  await applyCallLegUpdate(call, {
    source: "twilio-status",
    leg: isCustomer ? "customer" : "agent",
    callSid: isCustomer ? callSid : undefined,
    status: normalizedStatus,
    durationSeconds: parseDurationSeconds(callDuration),
  });

  if (!isCustomer && normalizedStatus === "completed") {
    const refreshed = await findCallLogByAnyLegSid(callSid);
    if (refreshed) await syncCustomerLegFromTwilio(refreshed);
  }

  return new NextResponse("OK", { status: 200 });
}
