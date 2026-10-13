import { NextResponse } from "next/server";
import db from "@/server/db";
import { applyCallLegUpdate, parseDurationSeconds } from "@/server/calls/callLegs";
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

/**
 * StatusCallback on &lt;Number&gt; — updates customer (PSTN dial) leg sid + duration.
 * When the customer leg is terminal, hang up the agent (and invite) legs too.
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
    source: "customer-leg-status",
    leg: "customer",
    callSid,
    status: callStatus || undefined,
    durationSeconds: parseDurationSeconds(callDuration),
  });

  const normalized = String(callStatus || "").toLowerCase();
  const pendingUpgrade = String(call.pendingConferenceName || "").trim();

  /**
   * Mid-upgrade Dial may report Number "completed" while the same CallSid is redirected
   * into conference — do not tear down the agent in that window.
   */
  if (TERMINAL_STATUSES.has(normalized) && !pendingUpgrade) {
    try {
      const inviteLegs = await db.InviteDialLeg.findAll({
        where: { callLogId: callId },
        attributes: ["callSid"],
      });
      await endCallLegs(call, inviteLegs);
      await call.update({ status: "completed" }).catch(() => {});
    } catch {
      /* ignore — Dial action / conference-status may still finish the agent */
    }
  }

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
