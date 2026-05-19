import { NextResponse } from "next/server";
import db from "@/server/db";
import { applyCallLegUpdate, parseDurationSeconds } from "@/server/calls/callLegs";
import {
  buildConferenceStatusCallbackUrl,
  buildConferenceTwiMl,
  getDefaultTwilioCallerId,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * &lt;Dial action="..."&gt; — fired when the customer leg ends; captures DialCallSid + duration.
 *
 * During conference upgrade from direct Dial, `/api/twilio/voice/bridge` Dial completes when the customer
 * leg is redirected; we must respond with TwiML that joins the agent (parent leg) into the same room —
 * redirecting the parent leg first hangs up the customer.
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

  /** Snapshot before applyCallLegUpdate (reload-safe). */
  const pendingConferenceName = String(call.pendingConferenceName || "").trim();

  if (dialCallSid) {
    await applyCallLegUpdate(call, {
      source: "dial-action",
      leg: "customer",
      callSid: dialCallSid,
      status: dialCallStatus || undefined,
      durationSeconds: parseDurationSeconds(dialCallDuration),
    });
  }

  if (pendingConferenceName) {
    const callerId =
      String(call.fromNumber || "").trim() || getDefaultTwilioCallerId();
    const origin = getRequestBaseUrlFromRequest(req);
    const statusCbUrl = origin ? buildConferenceStatusCallbackUrl(origin) : "";

    const agentConferenceTwiml = buildConferenceTwiMl({
      conferenceName: pendingConferenceName,
      participant: "agent",
      callerId,
      statusCallbackUrl: statusCbUrl || undefined,
    });

    const [affected] = await db.CallLog.update(
      { pendingConferenceName: null, conferenceName: pendingConferenceName },
      { where: { id: callId, pendingConferenceName: pendingConferenceName } },
    );

    if (affected) {
      return twimlResponse(agentConferenceTwiml);
    }

    /** Duplicate Dial action (retry) after we already committed — replay same TwiML. */
    const refreshed = await db.CallLog.findByPk(callId, {
      attributes: ["conferenceName"],
    });
    if (String(refreshed?.conferenceName || "").trim() === pendingConferenceName) {
      return twimlResponse(agentConferenceTwiml);
    }

    return new NextResponse("", { status: 200 });
  }

  return new NextResponse("", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
