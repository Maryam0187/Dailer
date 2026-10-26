import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { beginSalesBotSpeech, getOpenAiApiKey, waitForSalesBotSession } from "@/server/calls/salesBot";
import {
  addSpeakingSalesBot,
  findLabeledParticipant,
  removeLabeledParticipant,
} from "@/server/calls/salesBotJoin";
import { SALES_BOT_LABEL } from "@/server/calls/salesBot";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attach Sales Bot to an existing outbound dialer call (after Quick-Dial style start).
 * Upgrades to conference, joins AI, speaks once the customer is live.
 */
export async function POST(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  if (!getOpenAiApiKey()) {
    return NextResponse.json(
      { error: "Sales bot is not configured (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const origin = getRequestBaseUrlFromRequest(req);
  if (!origin) {
    return NextResponse.json(
      { error: "Could not determine public app URL for the sales bot." },
      { status: 500 },
    );
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: [
      "id",
      "userId",
      "conferenceName",
      "toNumber",
      "fromNumber",
      "callKind",
      "status",
      "customerCallSid",
    ],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const upgraded = await upgradeCallToConference({ req, authedUser, callId });
  if (!upgraded.ok) {
    const payload = { error: upgraded.error, retryable: upgraded.status === 409 };
    if (upgraded.twilioHint) payload.twilioHint = upgraded.twilioHint;
    return NextResponse.json(payload, { status: upgraded.status });
  }

  const conferenceName = String(upgraded.conferenceName || "").trim();
  if (!conferenceName) {
    return NextResponse.json({ error: "Conference is not ready yet.", retryable: true }, { status: 409 });
  }

  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    const conference = await waitForInProgressConference(client, conferenceName);
    if (!conference?.sid) {
      return NextResponse.json(
        { error: "Conference room is not live yet. Wait a moment and try again.", retryable: true },
        { status: 409 },
      );
    }

    const existing = await findLabeledParticipant(client, conference.sid, SALES_BOT_LABEL);
    const live = await waitForSalesBotSession(callId, 400);
    if (existing?.callSid && live?.beginSpeaking) {
      await beginSalesBotSpeech({ callId }).catch(() => {});
      await call.update({ callKind: "sales_bot", dialMode: "sales_bot" }).catch(() => {});
      return NextResponse.json({
        ok: true,
        attached: true,
        alreadyConnected: true,
        conferenceName,
        callMode: "conference",
      });
    }

    await removeLabeledParticipant(client, conference.sid, SALES_BOT_LABEL).catch(() => {});
    await addSpeakingSalesBot({
      client,
      conferenceSid: conference.sid,
      origin,
      callId,
    });

    const session = await waitForSalesBotSession(callId, 12000);
    if (!session?.beginSpeaking) {
      return NextResponse.json(
        { error: "Sales bot relay did not connect. Try again.", retryable: true },
        { status: 409 },
      );
    }

    // Customer is already live (upgrade requires it); speak from the start of this AI leg.
    await sleep(250);
    await beginSalesBotSpeech({ callId });

    await call.update({ callKind: "sales_bot", dialMode: "sales_bot" }).catch(() => {});

    return NextResponse.json({
      ok: true,
      attached: true,
      conferenceName,
      callMode: "conference",
    });
  } catch (err) {
    console.error("[sales-bot] attach failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to attach sales bot" },
      { status: 502 },
    );
  }
}
