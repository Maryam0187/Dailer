import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import {
  beginSalesBotSpeech,
  getOpenAiApiKey,
  pauseSalesBotSpeechForHold,
  SALES_BOT_LABEL,
  waitForSalesBotSession,
} from "@/server/calls/salesBot";
import {
  addSpeakingSalesBot,
  findLabeledParticipant,
  removeLabeledParticipant,
  setLabeledParticipantMuted,
} from "@/server/calls/salesBotJoin";
import {
  canAttachSalesBot,
  isFinishedMachineAnsweredBy,
  isPendingAnsweredBy,
} from "@/server/calls/salesBotAnsweredBy";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

async function silenceBotIfPresent(call) {
  const callId = Number(call?.id);
  const conferenceName = String(call?.conferenceName || "").trim();
  pauseSalesBotSpeechForHold(callId);
  if (!conferenceName || !Number.isInteger(callId) || callId <= 0) return;
  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    const conference = await waitForInProgressConference(client, conferenceName, {
      attempts: 3,
      delayMs: 200,
    });
    if (!conference?.sid) return;
    await setLabeledParticipantMuted(client, conference.sid, SALES_BOT_LABEL, true).catch(() => {});
  } catch {
    /* best-effort silence */
  }
}

export const runtime = "nodejs";

const RINGING_CUSTOMER = new Set(["queued", "ringing", "initiated"]);
const TERMINAL = new Set(["completed", "failed", "busy", "no-answer", "canceled", "cancelled"]);

function waiting(body) {
  return NextResponse.json({ waiting: true, retryable: true, ...body }, { status: 200 });
}

function machineMessage(answeredBy) {
  const label = String(answeredBy || "machine").trim() || "machine";
  return `A machine answered (${label}). The bot was not added.`;
}

async function fetchCustomerLeg(call) {
  const sid = String(call?.customerCallSid || "").trim();
  if (!sid) return null;
  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    const remote = await client.calls(sid).fetch();
    return {
      status: String(remote?.status || "").toLowerCase() || null,
      answeredBy: String(remote?.answeredBy || "").trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Softphone + Dial first (AMD on Number).
 * Only after AnsweredBy=human: upgrade to conference, add bot, speak.
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
      "status",
      "twilioSid",
      "customerCallSid",
      "answeredBy",
      "conferenceName",
    ],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = String(call.status || "").toLowerCase();
  if (TERMINAL.has(status)) {
    const answeredBy = String(call.answeredBy || "").trim().toLowerCase();
    if (isFinishedMachineAnsweredBy(answeredBy)) {
      return NextResponse.json({
        stop: true,
        error: machineMessage(answeredBy),
        phase: "machine",
        answeredBy,
        retryable: false,
      });
    }
    return NextResponse.json({
      stop: true,
      error: answeredBy
        ? `Call ended (${answeredBy}). The bot was not added.`
        : "Call ended before a person was confirmed.",
      phase: "ended",
      answeredBy: answeredBy || null,
      retryable: false,
    });
  }

  const customerLeg = await fetchCustomerLeg(call);
  if (customerLeg?.answeredBy) {
    const stored = String(call.answeredBy || "").trim().toLowerCase();
    if (customerLeg.answeredBy !== stored) {
      await call.update({ answeredBy: customerLeg.answeredBy.slice(0, 32) }).catch(() => {});
      call.answeredBy = customerLeg.answeredBy;
    }
  }

  const answeredBy = String(customerLeg?.answeredBy || call.answeredBy || "").trim().toLowerCase();
  const customerStatus = customerLeg?.status || null;

  // Finished voicemail / fax — silence bot and stop.
  if (isFinishedMachineAnsweredBy(answeredBy)) {
    await silenceBotIfPresent(call);
    return NextResponse.json({
      stop: true,
      error: machineMessage(answeredBy),
      phase: "machine",
      answeredBy,
      botAttached: false,
      speaking: false,
      retryable: false,
    });
  }

  if (!String(call.customerCallSid || "").trim() || !customerStatus || RINGING_CUSTOMER.has(customerStatus)) {
    return waiting({
      error: "Phone is ringing. Softphone is connected. Waiting for the customer.",
      phase: "ringing",
      botAttached: false,
      speaking: false,
      answeredBy: answeredBy || null,
      customerStatus,
    });
  }

  // Hold / connecting tone (machine_start) or still waiting: stop bot speech, wait for human.
  if (!canAttachSalesBot(answeredBy) || isPendingAnsweredBy(answeredBy)) {
    if (answeredBy === "machine_start" || String(call.conferenceName || "").trim()) {
      await silenceBotIfPresent(call);
    }
    return waiting({
      error:
        answeredBy === "machine_start"
          ? "Hold or connecting tone detected. Bot stopped. It will speak again when a person is confirmed."
          : "You can hear the line. Waiting for Twilio to confirm a person.",
      phase: "detecting",
      botAttached: false,
      speaking: false,
      answeredBy: answeredBy || null,
      customerStatus,
    });
  }

  try {
    const upgraded = await upgradeCallToConference({ req, authedUser, callId });
    if (!upgraded.ok) {
      const err = String(upgraded.error || "");
      const stillRinging =
        /still ringing|not on the line yet|not live yet/i.test(err) ||
        /customer=ringing|customer=queued|customer=initiated/i.test(String(upgraded.twilioHint || ""));
      return waiting({
        error: upgraded.error || "Moving the call so the bot can join…",
        phase: stillRinging ? "ringing" : "connecting",
        twilioHint: upgraded.twilioHint,
        answeredBy,
      });
    }

    const conferenceName = String(upgraded.conferenceName || call.conferenceName || "").trim();
    const { client } = await getTwilioContextForUserId(call.userId);
    const conference = await waitForInProgressConference(client, conferenceName);
    if (!conference?.sid) {
      return waiting({
        error: "A person answered. Opening the room for the bot…",
        phase: "connecting",
        answeredBy,
        conferenceName,
      });
    }

    let bot = await findLabeledParticipant(client, conference.sid, SALES_BOT_LABEL);
    if (!bot?.callSid) {
      await removeLabeledParticipant(client, conference.sid, SALES_BOT_LABEL).catch(() => {});
      await addSpeakingSalesBot({
        client,
        conferenceSid: conference.sid,
        origin,
        callId,
      });
      bot = await findLabeledParticipant(client, conference.sid, SALES_BOT_LABEL);
    }

    const session = await waitForSalesBotSession(callId, 8000);
    if (!session?.beginSpeaking) {
      return waiting({
        error: "A person answered. Connecting the bot…",
        phase: "connecting",
        botAttached: Boolean(bot?.callSid),
        speaking: false,
        answeredBy,
        conferenceName,
      });
    }

    await setLabeledParticipantMuted(client, conference.sid, SALES_BOT_LABEL, false).catch(() => {});
    const spoken = await beginSalesBotSpeech({ callId });
    if (!spoken?.ok) {
      return waiting({
        error: spoken?.error || "A person answered. The bot is about to speak…",
        phase: "connecting",
        botAttached: true,
        speaking: false,
        answeredBy,
        conferenceName,
      });
    }

    await call.update({ callKind: "sales_bot", dialMode: "sales_bot" }).catch(() => {});
    return NextResponse.json({
      ok: true,
      attached: true,
      botAttached: true,
      speaking: true,
      phase: "human",
      answeredBy,
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
