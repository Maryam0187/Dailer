import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient } from "@/server/twilio";

function inferParticipantLabel(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  const callSid = String(participant?.callSid || "").trim();

  if (to.startsWith("client:")) return to.replace("client:", "");
  if (from.startsWith("client:")) return from.replace("client:", "");
  if (to) return to;
  if (from) return from;
  return callSid || "Unknown participant";
}

function inferParticipantType(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  if (to.startsWith("client:") || from.startsWith("client:")) return "agent";
  return "external";
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const conferenceName = String(url.searchParams.get("conferenceName") || "").trim();

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }
  if (!conferenceName) {
    return NextResponse.json({ error: "conferenceName is required" }, { status: 400 });
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId, userId: authedUser.id },
    attributes: ["id"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  try {
    const client = getTwilioClient();
    const matches = await client.conferences.list({
      friendlyName: conferenceName,
      status: "in-progress",
      limit: 1,
    });

    if (!matches.length) {
      return NextResponse.json({ conferenceName, participants: [] });
    }

    const conference = matches[0];
    const participantRecords = await client
      .conferences(conference.sid)
      .participants.list({ limit: 50 });
    const participants = participantRecords.map((p) => ({
      callSid: p.callSid,
      label: inferParticipantLabel(p),
      type: inferParticipantType(p),
      muted: Boolean(p.muted),
      hold: Boolean(p.hold),
      status: p.status || "joined",
      joinedAt: p.dateCreated ? new Date(p.dateCreated).toISOString() : null,
    }));

    return NextResponse.json({
      conferenceName,
      conferenceSid: conference.sid,
      participants,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to load conference participants" },
      { status: 502 },
    );
  }
}

