import { NextResponse } from "next/server";
import db from "@/server/db";
import { applyCallLegUpdate, parseDurationSeconds } from "@/server/calls/callLegs";
import {
  buildConferenceStatusCallbackUrl,
  buildConferenceTwiMl,
  getDefaultTwilioCallerId,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";
import { getTwilioClient } from "@/server/twilio";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set([
  "completed",
  "canceled",
  "cancelled",
  "failed",
  "busy",
  "no-answer",
]);

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function hangupTwiml() {
  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
}

async function customerLegStillLive(call, dialCallSid) {
  const sid = String(dialCallSid || call?.customerCallSid || "").trim();
  if (!sid) return false;

  let client;
  try {
    const ownerId = Number(call?.userId);
    if (Number.isInteger(ownerId) && ownerId > 0) {
      client = (await getTwilioContextForUserId(ownerId)).client;
    } else {
      client = await getTwilioClient();
    }
  } catch {
    client = await getTwilioClient();
  }

  try {
    const remote = await client.calls(sid).fetch();
    const status = String(remote?.status || "").toLowerCase();
    return Boolean(status) && !TERMINAL_STATUSES.has(status);
  } catch {
    return false;
  }
}

/**
 * &lt;Dial action="..."&gt; — fired when the customer leg ends; captures DialCallSid + duration.
 *
 * During conference upgrade from direct Dial, `/api/twilio/voice/bridge` Dial completes when the customer
 * leg is redirected; we must respond with TwiML that joins the agent (parent leg) into the same room —
 * redirecting the parent leg first hangs up the customer.
 *
 * Real customer hangup (no pending upgrade, or customer already terminal) must Hangup the agent.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const form = await req.formData();
  const dialCallSid = String(form.get("DialCallSid") || "").trim();
  const dialCallStatus = String(form.get("DialCallStatus") || "").trim();
  const dialCallDuration = form.get("DialCallDuration");

  if (!Number.isInteger(callId) || callId <= 0) {
    return hangupTwiml();
  }

  const call = await db.CallLog.findByPk(callId);
  if (!call) return hangupTwiml();

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
    /** Upgrade redirect keeps the customer CallSid live; hangup makes it terminal. */
    const stillLive = await customerLegStillLive(call, dialCallSid);
    if (!stillLive) {
      await db.CallLog.update(
        { pendingConferenceName: null },
        { where: { id: callId, pendingConferenceName: pendingConferenceName } },
      ).catch(() => {});
      return hangupTwiml();
    }

    const callerId =
      String(call.fromNumber || "").trim() || (await getDefaultTwilioCallerId());
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

    return hangupTwiml();
  }

  return hangupTwiml();
}

export async function GET(req) {
  return POST(req);
}
