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
  isHumanAnsweredBy,
} from "@/server/calls/salesBotAnsweredBy";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

const RINGING_CUSTOMER = new Set(["queued", "ringing", "initiated"]);
const TERMINAL = new Set(["completed", "failed", "busy", "no-answer", "canceled", "cancelled"]);

/** Wait this long after pickup before attaching when AMD is empty or machine_start. */
const AMD_GRACE_MS = 4500;

function waiting(body) {
  return NextResponse.json({ waiting: true, retryable: true, ...body }, { status: 200 });
}

function machineMessage(answeredBy) {
  const label = String(answeredBy || "machine").trim() || "machine";
  return `A machine answered (${label}). The bot was not added.`;
}

function msSince(dateLike) {
  if (!dateLike) return null;
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now() - t);
}

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
    /* best-effort */
  }
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
 * Softphone + Dial AMD first. Conference + bot only when we should speak.
 * If Twilio never returns AnsweredBy while the line is live, attach after a short grace.
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
      "customerAnsweredAt",
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
  const liveCustomer = customerStatus === "in-progress" || customerStatus === "answered";

  // Stamp pickup time so the AMD grace period has a real clock (status alone is not enough).
  if (liveCustomer && !call.customerAnsweredAt) {
    const now = new Date();
    await call.update({ customerAnsweredAt: now }).catch(() => {});
    call.customerAnsweredAt = now;
  }

  const answeredAgeMs = msSince(call.customerAnsweredAt);
  const graceElapsed = liveCustomer && answeredAgeMs != null && answeredAgeMs >= AMD_GRACE_MS;
  // No AMD / only machine_start during hold — after grace, attach so we never stick on null.
  const presumeLive =
    liveCustomer &&
    graceElapsed &&
    !isFinishedMachineAnsweredBy(answeredBy) &&
    !isHumanAnsweredBy(answeredBy);

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

  if (!canAttachSalesBot(answeredBy, { presumeLive })) {
    if (answeredBy === "machine_start" || String(call.conferenceName || "").trim()) {
      await silenceBotIfPresent(call);
    }
    const waitMs =
      answeredAgeMs == null ? AMD_GRACE_MS : Math.max(0, AMD_GRACE_MS - answeredAgeMs);
    return waiting({
      error:
        answeredBy === "machine_start"
          ? "Hold or connecting tone. Bot stays silent briefly, then joins if the line stays live."
          : `Line is live. Waiting up to ${Math.ceil(waitMs / 1000)}s for Twilio AMD, then the bot will join.`,
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
        answeredBy: answeredBy || null,
      });
    }

    const conferenceName = String(upgraded.conferenceName || call.conferenceName || "").trim();
    const { client } = await getTwilioContextForUserId(call.userId);
    const conference = await waitForInProgressConference(client, conferenceName);
    if (!conference?.sid) {
      return waiting({
        error: "Opening the room for the bot…",
        phase: "connecting",
        answeredBy: answeredBy || null,
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
        error: "Connecting the bot…",
        phase: "connecting",
        botAttached: Boolean(bot?.callSid),
        speaking: false,
        answeredBy: answeredBy || null,
        conferenceName,
      });
    }

    await setLabeledParticipantMuted(client, conference.sid, SALES_BOT_LABEL, false).catch(() => {});
    const spoken = await beginSalesBotSpeech({ callId });
    if (!spoken?.ok) {
      return waiting({
        error: spoken?.error || "The bot is about to speak…",
        phase: "connecting",
        botAttached: true,
        speaking: false,
        answeredBy: answeredBy || null,
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
      answeredBy: answeredBy || (presumeLive ? "presumed_live" : null),
      conferenceName,
      callMode: "conference",
      presumedLive: Boolean(presumeLive),
    });
  } catch (err) {
    console.error("[sales-bot] attach failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to attach sales bot" },
      { status: 502 },
    );
  }
}
