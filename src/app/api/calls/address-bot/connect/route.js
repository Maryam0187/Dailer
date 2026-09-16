import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ADDRESS_BOT_LABEL, getOpenAiApiKey, waitForAddressBotSession } from "@/server/calls/addressBot";
import {
  addMutedAddressBot,
  findLabeledParticipant,
  removeLabeledParticipant,
} from "@/server/calls/addressBotJoin";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioClient } from "@/server/twilio";

export const runtime = "nodejs";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!getOpenAiApiKey()) {
    return NextResponse.json(
      { error: "Address bot is not configured (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "conferenceName"],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = getRequestBaseUrlFromRequest(req);
  if (!origin) {
    return NextResponse.json(
      { error: "Could not determine public app URL for the address bot." },
      { status: 500 },
    );
  }

  const upgraded = await upgradeCallToConference({ req, authedUser, callId });
  if (!upgraded.ok) {
    const payload = { error: upgraded.error };
    if (upgraded.twilioHint) payload.twilioHint = upgraded.twilioHint;
    return NextResponse.json(payload, { status: upgraded.status });
  }

  const conferenceName = String(upgraded.conferenceName || "").trim();
  if (!conferenceName) {
    return NextResponse.json({ error: "Conference is not ready yet." }, { status: 409 });
  }

  try {
    const client = getTwilioClient();
    const conference = await waitForInProgressConference(client, conferenceName);
    if (!conference?.sid) {
      return NextResponse.json(
        { error: "Conference room is not live yet. Wait a moment and try again." },
        { status: 409 },
      );
    }

    const existing = await findLabeledParticipant(client, conference.sid, ADDRESS_BOT_LABEL);
    const live = await waitForAddressBotSession(callId, 400);
    if (existing?.callSid && live) {
      await client.conferences(conference.sid).participants(existing.callSid).update({ muted: true }).catch(() => {});
      return NextResponse.json({
        ok: true,
        connected: true,
        alreadyConnected: true,
        conferenceName,
        callMode: "conference",
        botCallSid: existing.callSid,
      });
    }

    await removeLabeledParticipant(client, conference.sid, ADDRESS_BOT_LABEL);

    const participant = await addMutedAddressBot({
      client,
      conferenceSid: conference.sid,
      origin,
      callId,
    });

    const session = await waitForAddressBotSession(callId, 12000);
    if (!session) {
      await removeLabeledParticipant(client, conference.sid, ADDRESS_BOT_LABEL);
      return NextResponse.json(
        { error: "Address bot joined but did not become ready. Try Ready bot again." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      conferenceName,
      callMode: "conference",
      botCallSid: participant?.callSid || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to connect address bot" },
      { status: 502 },
    );
  }
}
