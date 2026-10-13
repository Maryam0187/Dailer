import { NextResponse } from "next/server";
import db from "@/server/db";
import {
  applyCallLegUpdate,
  findCallLogByAnyLegSid,
  parseDurationSeconds,
  syncCustomerLegFromTwilio,
} from "@/server/calls/callLegs";
import { endCallLegs } from "@/server/twilioEndCall";

export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set([
  "completed",
  "canceled",
  "cancelled",
  "failed",
  "busy",
  "no-answer",
]);

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

  const pendingUpgrade = String(call.pendingConferenceName || "").trim();
  if (isCustomer && TERMINAL_STATUSES.has(normalizedStatus) && !pendingUpgrade) {
    try {
      const inviteLegs = await db.InviteDialLeg.findAll({
        where: { callLogId: call.id },
        attributes: ["callSid"],
      });
      await endCallLegs(call, inviteLegs);
      await call.update({ status: "completed" }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  return new NextResponse("OK", { status: 200 });
}
