import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { beginSalesBotSpeech, getOpenAiApiKey, waitForSalesBotSession } from "@/server/calls/salesBot";
import {
  addSpeakingSalesBot,
  findLabeledParticipant,
  removeLabeledParticipant,
  setLabeledParticipantMuted,
} from "@/server/calls/salesBotJoin";
import { SALES_BOT_LABEL } from "@/server/calls/salesBot";
import { isHumanAnsweredBy } from "@/server/calls/salesBotAnsweredBy";
import { syncCustomerLegFromTwilio } from "@/server/calls/callLegs";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { upgradeCallToConference, waitForInProgressConference } from "@/server/calls/upgradeToConference";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

const LIVE_CUSTOMER = new Set(["in-progress", "answered"]);
const RINGING_CUSTOMER = new Set(["queued", "ringing", "initiated"]);

function waiting(body) {
  return NextResponse.json({ waiting: true, retryable: true, ...body }, { status: 200 });
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

async function findSalesBotConference(client, conferenceName) {
  const name = String(conferenceName || "").trim();
  if (!name) return null;
  for (const status of ["in-progress", "init"]) {
    const matches = await client.conferences.list({
      friendlyName: name,
      status,
      limit: 1,
    });
    if (matches.length) return matches[0];
  }
  return null;
}

/**
 * The bot joins the conference while the phone is ringing and stays muted.
 * Speech starts only when Twilio AMD reports AnsweredBy=human (DetectMessageEnd).
 * Call status in-progress is not a human answer.
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
    return NextResponse.json(
      { stop: true, error: "Call already ended.", retryable: false },
      { status: 200 },
    );
  }

  const presetConference = String(call.conferenceName || "").trim();
  // Sales Bot already stored the customer leg. Do not replace it with another in-progress call.
  if (!presetConference && String(call.twilioSid || "").trim()) {
    await syncCustomerLegFromTwilio(call).catch(() => {});
  }
  const customerLeg = String(call.customerCallSid || "").trim()
    ? await fetchCustomerLeg(call)
    : null;
  const customerStatus = customerLeg?.status || null;
  if (customerLeg?.answeredBy) {
    const stored = String(call.answeredBy || "").trim().toLowerCase();
    if (customerLeg.answeredBy !== stored) {
      await call.update({ answeredBy: customerLeg.answeredBy.slice(0, 32) }).catch(() => {});
      call.answeredBy = customerLeg.answeredBy;
    }
  }
  const customerLive = LIVE_CUSTOMER.has(String(customerStatus || ""));

  if (!presetConference && !String(call.customerCallSid || "").trim()) {
    return waiting({
      error: "Customer is still ringing. Waiting for answer…",
      phase: "ringing",
    });
  }

  if (!presetConference && (!customerStatus || RINGING_CUSTOMER.has(customerStatus))) {
    return waiting({
      error: "Customer is still ringing. Waiting for answer…",
      phase: "ringing",
      customerStatus,
    });
  }
  if (!presetConference && !customerLive) {
    return waiting({
      error: "Customer line is not live yet.",
      phase: "ringing",
      customerStatus,
    });
  }

  let answeredBy = String(call.answeredBy || "").trim();
  if (String(answeredBy || "").trim().toLowerCase() === "fax") {
    return NextResponse.json(
      {
        error: "Fax answered. The bot did not speak.",
        phase: "machine",
        answeredBy,
        retryable: false,
      },
      { status: 422 },
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
      phase: stillRinging ? "ringing" : "connecting",
    };
    if (upgraded.twilioHint) payload.twilioHint = upgraded.twilioHint;
    if (upgraded.status === 409) return waiting(payload);
    return NextResponse.json({ ...payload, retryable: false }, { status: upgraded.status });
  }

  const conferenceName = String(upgraded.conferenceName || "").trim();
  if (!conferenceName) {
    return waiting({ error: "Conference is not ready yet.", phase: "connecting" });
  }

  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    let conference = await findSalesBotConference(client, conferenceName);
    if (!conference?.sid) {
      conference = await waitForInProgressConference(client, conferenceName, {
        attempts: 2,
        delayMs: 200,
      });
    }

    const roomSid = conference?.sid || conferenceName;
    let botParticipant = conference?.sid
      ? await findLabeledParticipant(client, conference.sid, SALES_BOT_LABEL)
      : null;
    if (!botParticipant?.callSid) {
      await addSpeakingSalesBot({
        client,
        conferenceSid: roomSid,
        origin,
        callId,
      });
      conference = (await findSalesBotConference(client, conferenceName)) || conference;
      if (conference?.sid) {
        botParticipant = await findLabeledParticipant(client, conference.sid, SALES_BOT_LABEL);
      }
    }

    const sessionWaitMs = botParticipant?.callSid ? 1500 : 8000;
    let session = await waitForSalesBotSession(callId, sessionWaitMs);

    await call.reload({ attributes: ["answeredBy", "customerCallSid"] }).catch(() => {});
    const freshLeg = await fetchCustomerLeg(call);
    if (freshLeg?.answeredBy) {
      const stored = String(call.answeredBy || "").trim().toLowerCase();
      if (freshLeg.answeredBy !== stored) {
        await call.update({ answeredBy: freshLeg.answeredBy.slice(0, 32) }).catch(() => {});
      }
    }
    answeredBy = String(freshLeg?.answeredBy || call.answeredBy || answeredBy || "").trim();
    const freshStatus = freshLeg?.status || customerStatus;
    const customerParticipant = conference?.sid
      ? await findLabeledParticipant(client, conference.sid, "customer")
      : null;
    const participantStatus = String(customerParticipant?.status || "").toLowerCase();
    const stillRinging =
      !freshStatus ||
      RINGING_CUSTOMER.has(freshStatus) ||
      participantStatus === "ringing" ||
      participantStatus === "queued" ||
      participantStatus === "connecting";
    const humanAnswered = isHumanAnsweredBy(answeredBy);

    if (String(answeredBy || "").trim().toLowerCase() === "fax") {
      return NextResponse.json(
        {
          error: "Fax answered. The bot did not speak.",
          phase: "machine",
          answeredBy,
          retryable: false,
        },
        { status: 422 },
      );
    }

    if (!humanAnswered) {
      return waiting({
        error: "Bot is on the call and silent until a person answers.",
        phase: stillRinging ? "ringing" : "detecting",
        botAttached: Boolean(botParticipant?.callSid || session?.beginSpeaking),
        speaking: false,
        answeredBy: answeredBy || null,
        customerStatus: freshStatus || null,
        conferenceName,
      });
    }

    if (!session?.beginSpeaking) {
      if (conference?.sid) {
        await removeLabeledParticipant(client, conference.sid, SALES_BOT_LABEL).catch(() => {});
      }
      await addSpeakingSalesBot({
        client,
        conferenceSid: conference?.sid || conferenceName,
        origin,
        callId,
      });
      session = await waitForSalesBotSession(callId, 8000);
    }

    if (!session?.beginSpeaking) {
      return waiting({
        error: "Customer answered. The bot is joining…",
        phase: "connecting",
        botAttached: false,
        speaking: false,
        conferenceName,
      });
    }

    if (conference?.sid) {
      await setLabeledParticipantMuted(client, conference.sid, SALES_BOT_LABEL, false).catch((err) => {
        console.error("[sales-bot] unmute before speech failed:", err?.message || err);
      });
    }
    const spoken = await beginSalesBotSpeech({ callId });
    if (!spoken?.ok) {
      return waiting({
        error: spoken?.error || "Customer answered. The bot is joining…",
        phase: "connecting",
        botAttached: true,
        speaking: false,
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
      answeredBy: answeredBy || null,
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
