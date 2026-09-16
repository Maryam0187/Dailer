import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  ADDRESS_BOT_LABEL,
  buildAddressBotConnectTwiml,
  getOpenAiApiKey,
  loadCompanyAddressById,
} from "@/server/calls/addressBot";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioClient, getTwilioFromNumber } from "@/server/twilio";

export const runtime = "nodejs";

async function removeLabeledParticipant(client, conferenceSid, label) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!conferenceSid || !wanted) return;
  const participants = await client.conferences(conferenceSid).participants.list({ limit: 50 });
  const match = participants.find((p) => String(p.label || "").trim().toLowerCase() === wanted);
  if (!match?.callSid) return;
  await client.conferences(conferenceSid).participants(match.callSid).remove().catch(() => {});
}

/** SDK participant.create() requires `to` and ignores `twiml`. REST allows From + Twiml with no To. */
async function createTwimlConferenceParticipant({ client, conferenceSid, from, twiml, label }) {
  const accountSid = String(client.accountSid || "").trim();
  const authToken = String(client.password || "").trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Conferences/${encodeURIComponent(conferenceSid)}/Participants.json`;
  const body = new URLSearchParams({
    From: String(from || "").trim(),
    Twiml: String(twiml || ""),
    Label: String(label || "").trim(),
    EarlyMedia: "true",
    EndConferenceOnExit: "false",
    Beep: "false",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error_message || `Twilio participant create failed (${res.status})`);
  }
  return json;
}

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
  const addressId = Number(body?.addressId);

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return NextResponse.json({ error: "addressId must be a positive integer" }, { status: 400 });
  }

  const address = await loadCompanyAddressById(addressId);
  if (!address) return NextResponse.json({ error: "Address not found" }, { status: 404 });

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

    await removeLabeledParticipant(client, conference.sid, ADDRESS_BOT_LABEL);

    const twiml = buildAddressBotConnectTwiml({
      origin,
      addressId: address.id,
      callId,
      addressText: address.address,
    });

    const participant = await createTwimlConferenceParticipant({
      client,
      conferenceSid: conference.sid,
      from: getTwilioFromNumber(),
      twiml,
      label: ADDRESS_BOT_LABEL,
    });

    return NextResponse.json({
      ok: true,
      conferenceName,
      callMode: "conference",
      addressId: address.id,
      addressLabel: address.label,
      botCallSid: participant?.call_sid || participant?.callSid || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to start address bot" },
      { status: 502 },
    );
  }
}
