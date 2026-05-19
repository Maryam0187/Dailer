import { NextResponse } from "next/server";
import db from "@/server/db";
import { getTwilioClient } from "@/server/twilio";
import { syncAllLegDurationsFromTwilio } from "@/server/calls/callLegs";
import { endCallLegs } from "@/server/twilioEndCall";

export const runtime = "nodejs";

/** Twilio sends `participant-leave` (new) or legacy `leave` in some paths. */
function isParticipantLeaveEvent(value) {
  const e = String(value || "").toLowerCase();
  return e === "participant-leave" || e === "leave";
}

async function callLegLooksLikeVoiceAgent(client, callSid) {
  const sid = String(callSid || "").trim();
  if (!sid) return false;
  try {
    const c = await client.calls(sid).fetch();
    const from = String(c.from || "").trim().toLowerCase();
    const to = String(c.to || "").trim().toLowerCase();
    return from.startsWith("client:") || to.startsWith("client:");
  } catch {
    return false;
  }
}

/**
 * Conference statusCallback — after an owner/agent browser leg disconnects from the room,
 * end the PSTN/customer invite legs too when no Voice SDK agents remain (no `client:` call).
 */
export async function POST(req) {
  const form = await req.formData();

  const event = String(form.get("StatusCallbackEvent") || "").trim();
  const friendlyName = String(form.get("FriendlyName") || "").trim();

  if (!isParticipantLeaveEvent(event) || !friendlyName) {
    return new NextResponse("OK", { status: 200 });
  }

  const leavingCallSid = String(form.get("CallSid") || "").trim();

  try {
    const call = await db.CallLog.findOne({
      where: { conferenceName: friendlyName },
      attributes: [
        "id",
        "twilioSid",
        "customerCallSid",
        "agentDurationSeconds",
        "customerDurationSeconds",
        "durationSeconds",
        "status",
      ],
    });
    if (!call) return new NextResponse("OK", { status: 200 });

    const client = getTwilioClient();

    /** Conference may already be tearing down — list is best-effort. */
    const matches = await client.conferences.list({
      friendlyName,
      status: "in-progress",
      limit: 1,
    });
    if (!matches.length) return new NextResponse("OK", { status: 200 });

    const participants = await client.conferences(matches[0].sid).participants.list({ limit: 80 });

    const candidates = participants.filter((p) => {
      const sid = String(p?.callSid || "").trim();
      if (!sid) return false;
      if (leavingCallSid && sid === leavingCallSid) return false;
      return true;
    });

    const agentPresence = await Promise.all(
      candidates.map((p) => callLegLooksLikeVoiceAgent(client, p.callSid)),
    );
    const hasAgent = agentPresence.some(Boolean);

    if (hasAgent) return new NextResponse("OK", { status: 200 });

    const inviteLegs = await db.InviteDialLeg.findAll({
      where: { callLogId: call.id },
      attributes: ["callSid"],
    });

    await endCallLegs(call, inviteLegs);
    await syncAllLegDurationsFromTwilio(call);
    await call.reload({
      attributes: [
        "id",
        "agentDurationSeconds",
        "customerDurationSeconds",
        "durationSeconds",
        "twilioSid",
        "customerCallSid",
      ],
    });
    await call.update({ status: "completed" }).catch(() => {});
  } catch {
    /* ignore */
  }

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
