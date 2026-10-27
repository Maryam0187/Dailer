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
import {
  isHumanAnsweredBy,
  isMachineAnsweredBy,
  waitForAnsweredBy,
} from "@/server/calls/salesBotAnsweredBy";
import { syncCustomerLegFromTwilio } from "@/server/calls/callLegs";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LIVE_CUSTOMER = new Set(["in-progress", "answered"]);
const RINGING_CUSTOMER = new Set(["queued", "ringing", "initiated"]);

async function fetchCustomerLegStatus(call) {
  const sid = String(call?.customerCallSid || "").trim();
  if (!sid) return null;
  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    const remote = await client.calls(sid).fetch();
    return String(remote?.status || "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Attach Sales Bot after a real human answers (Twilio AMD).
 * Do not speak on ringing, carrier connect, or machine/voicemail.
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
  if (String(body?.intent || "").trim() !== "sales_bot") {
    return NextResponse.json({ error: "intent must be sales_bot" }, { status: 400 });
  }
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
      "twilioSid",
      "customerCallSid",
      "answeredBy",
    ],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = String(call.status || "").toLowerCase();
  if (["completed", "failed", "busy", "no-answer", "canceled", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "Call already ended.", retryable: false }, { status: 409 });
  }

  // Discover customer leg (webhooks can lag).
  if (String(call.twilioSid || "").trim()) {
    await syncCustomerLegFromTwilio(call).catch(() => {});
  }

  if (!String(call.customerCallSid || "").trim()) {
    return NextResponse.json(
      {
        error: "Customer is still ringing. Waiting for answer…",
        phase: "ringing",
        retryable: true,
      },
      { status: 409 },
    );
  }

  const customerStatus = await fetchCustomerLegStatus(call);
  if (!customerStatus || RINGING_CUSTOMER.has(customerStatus)) {
    return NextResponse.json(
      {
        error: "Customer is still ringing. Waiting for answer…",
        phase: "ringing",
        retryable: true,
        customerStatus,
      },
      { status: 409 },
    );
  }
  if (!LIVE_CUSTOMER.has(customerStatus)) {
    return NextResponse.json(
      {
        error: "Customer line is not live yet.",
        phase: "ringing",
        retryable: true,
        customerStatus,
      },
      { status: 409 },
    );
  }

  // Line may be "in-progress" from carrier connect before a person picks up.
  // Speak only after Twilio AMD reports human.
  const answeredBy = await waitForAnsweredBy(call, { attempts: 12, delayMs: 500 });
  if (isMachineAnsweredBy(answeredBy)) {
    return NextResponse.json(
      {
        ok: false,
        attached: false,
        phase: "machine",
        answeredBy,
        error: "Automated message / voicemail — AI will not speak. Unmute to take the call.",
        retryable: false,
      },
      { status: 409 },
    );
  }
  if (!isHumanAnsweredBy(answeredBy)) {
    return NextResponse.json(
      {
        error: "Waiting for a person to answer (not speaking during connect/ringback)…",
        phase: "detecting",
        answeredBy: answeredBy || null,
        retryable: true,
      },
      { status: 409 },
    );
  }

  const upgraded = await upgradeCallToConference({ req, authedUser, callId });
  if (!upgraded.ok) {
    const err = String(upgraded.error || "");
    const stillRinging =
      /still ringing|not on the line yet|not live yet/i.test(err) ||
      /customer=ringing|customer=queued|customer=initiated/i.test(
        String(upgraded.twilioHint || ""),
      );
    const payload = {
      error: upgraded.error,
      retryable: upgraded.status === 409,
      phase: stillRinging ? "ringing" : "connecting",
    };
    if (upgraded.twilioHint) payload.twilioHint = upgraded.twilioHint;
    return NextResponse.json(payload, { status: upgraded.status });
  }

  const conferenceName = String(upgraded.conferenceName || "").trim();
  if (!conferenceName) {
    return NextResponse.json(
      { error: "Conference is not ready yet.", phase: "connecting", retryable: true },
      { status: 409 },
    );
  }

  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    const conference = await waitForInProgressConference(client, conferenceName);
    if (!conference?.sid) {
      return NextResponse.json(
        {
          error: "Conference room is not live yet. Wait a moment and try again.",
          phase: "connecting",
          retryable: true,
        },
        { status: 409 },
      );
    }

    await call.reload({ attributes: ["answeredBy"] }).catch(() => {});
    if (isMachineAnsweredBy(call.answeredBy)) {
      await removeLabeledParticipant(client, conference.sid, SALES_BOT_LABEL).catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          attached: false,
          phase: "machine",
          answeredBy: call.answeredBy,
          error: "Automated message / voicemail — AI will not speak. Unmute to take the call.",
          retryable: false,
        },
        { status: 409 },
      );
    }
    if (!isHumanAnsweredBy(call.answeredBy)) {
      return NextResponse.json(
        {
          error: "Waiting for a person to answer (not speaking during connect/ringback)…",
          phase: "detecting",
          answeredBy: call.answeredBy || null,
          retryable: true,
        },
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
        phase: "human",
        answeredBy: call.answeredBy || "human",
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
        {
          error: "Sales bot relay did not connect. Try again.",
          phase: "connecting",
          retryable: true,
        },
        { status: 409 },
      );
    }

    await sleep(250);
    await beginSalesBotSpeech({ callId });

    await call.update({ callKind: "sales_bot", dialMode: "sales_bot" }).catch(() => {});

    return NextResponse.json({
      ok: true,
      attached: true,
      phase: "human",
      answeredBy: call.answeredBy || answeredBy || "human",
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
