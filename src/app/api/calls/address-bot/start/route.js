import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  ADDRESS_BOT_LABEL,
  beginAddressBotSpeech,
  getOpenAiApiKey,
  loadCompanyAddressById,
} from "@/server/calls/addressBot";
import { findLabeledParticipant, setAddressBotSpeaking } from "@/server/calls/addressBotJoin";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { waitForInProgressConference } from "@/server/calls/upgradeToConference";
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

  const conferenceName = String(body?.conferenceName || call.conferenceName || "").trim();
  if (!conferenceName) {
    return NextResponse.json(
      { error: "Address bot is not connected yet. Click Ready bot first." },
      { status: 409 },
    );
  }

  const origin = getRequestBaseUrlFromRequest(req);

  try {
    const client = getTwilioClient();
    const conference = await waitForInProgressConference(client, conferenceName);
    if (!conference?.sid) {
      return NextResponse.json(
        { error: "Conference room is not live yet. Wait a moment and try again." },
        { status: 409 },
      );
    }

    const bot = await findLabeledParticipant(client, conference.sid, ADDRESS_BOT_LABEL);
    if (!bot?.callSid) {
      return NextResponse.json(
        { error: "Address bot is not connected yet. Click Ready bot first." },
        { status: 409 },
      );
    }

    await setAddressBotSpeaking(client, conference.sid, { speaking: true, origin });
    await new Promise((resolve) => setTimeout(resolve, 600));

    const begun = await beginAddressBotSpeech({ callId, addressId: address.id });
    if (!begun?.ok) {
      await setAddressBotSpeaking(client, conference.sid, { speaking: false, origin }).catch(() => {});
      return NextResponse.json(
        { error: begun?.error || "Address bot is not connected yet. Click Ready bot first." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      conferenceName,
      callMode: "conference",
      addressId: address.id,
      addressLabel: address.label,
      address: address.address,
      botCallSid: bot.callSid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to start address bot" },
      { status: 502 },
    );
  }
}
