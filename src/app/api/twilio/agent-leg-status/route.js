import { NextResponse } from "next/server";
import db from "@/server/db";
import {
  applyCallLegUpdate,
  isCustomerFirstDial,
  parseDurationSeconds,
} from "@/server/calls/callLegs";
import { logCustomerStatus } from "@/server/calls/customerStatusLog";
import { getTwilioClient } from "@/server/twilio";

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

  const normalizedStatus = String(callStatus || "").trim().toLowerCase();

  logCustomerStatus("webhook.agent-leg-status", {
    callId,
    callSid,
    callStatus: normalizedStatus,
    dialMode: call.dialMode,
    leg: "agent",
    userId: call.userId,
  });

  await applyCallLegUpdate(call, {
    source: "agent-leg-status",
    leg: "agent",
    callSid,
    status: normalizedStatus || undefined,
    durationSeconds: parseDurationSeconds(callDuration),
  });

  // Cold dial: customer is the parent PSTN call; re-push parent status when agent leg moves
  // (customer callbacks are on /api/twilio/status only — may not fire again after bridge).
  if (
    isCustomerFirstDial(call) &&
    ["ringing", "in-progress", "answered"].includes(normalizedStatus)
  ) {
    const parentSid = String(call.twilioSid || "").trim();
    if (parentSid) {
      try {
        const parent = await getTwilioClient().calls(parentSid).fetch();
        const parentStatus = String(parent.status || "").trim().toLowerCase();
        if (parentStatus) {
          await applyCallLegUpdate(call, {
            source: "agent-leg-status-parent-sync",
            leg: "customer",
            callSid: parentSid,
            status: parentStatus,
            durationSeconds: parseDurationSeconds(parent.duration),
          });
        }
      } catch {
        /* ignore */
      }
    }
  }

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
