import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import {
  beginSalesBotSpeech,
  buildSalesBotConnectTwiml,
  getOpenAiApiKey,
  waitForSalesBotSession,
} from "@/server/calls/salesBot";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { isMachineAnsweredBy } from "@/server/calls/salesBotAnsweredBy";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

const RINGING_CUSTOMER = new Set(["queued", "ringing", "initiated"]);

function waiting(body) {
  return NextResponse.json({ waiting: true, retryable: true, ...body }, { status: 200 });
}

async function fetchCustomerLeg(call) {
  const sid = String(call?.customerCallSid || call?.twilioSid || "").trim();
  if (!sid) return null;
  try {
    const { client } = await getTwilioContextForUserId(call.userId);
    const remote = await client.calls(sid).fetch();
    return {
      status: String(remote?.status || "").toLowerCase() || null,
      answeredBy: String(remote?.answeredBy || "").trim().toLowerCase(),
      sid,
    };
  } catch {
    return null;
  }
}

/**
 * Direct call. The bot is not attached at Start and there is no conference.
 * It is connected only after Twilio reports AnsweredBy=human (a person spoke).
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
  const stillRinging = !customerStatus || RINGING_CUSTOMER.has(customerStatus);

  if (isMachineAnsweredBy(answeredBy)) {
    const sid = String(customerLeg?.sid || call.customerCallSid || call.twilioSid || "").trim();
    if (sid && customerStatus && !["completed", "canceled", "cancelled", "failed", "busy", "no-answer"].includes(customerStatus)) {
      try {
        const { client } = await getTwilioContextForUserId(call.userId);
        await client.calls(sid).update({ status: "completed" });
      } catch (err) {
        console.error("[sales-bot] machine hangup failed:", err?.message || err);
      }
    }
    return NextResponse.json({
      stop: true,
      error: `A machine answered (${answeredBy}). The bot was not attached.`,
      phase: "machine",
      answeredBy,
      botAttached: false,
      speaking: false,
      waiting: false,
      retryable: false,
    });
  }

  if (answeredBy !== "human") {
    return waiting({
      error: "Direct call. The bot attaches only after a person speaks.",
      phase: stillRinging ? "ringing" : "detecting",
      botAttached: false,
      speaking: false,
      answeredBy: answeredBy || null,
      customerStatus,
    });
  }

  try {
    let session = await waitForSalesBotSession(callId, 800);
    const sid = String(customerLeg?.sid || call.customerCallSid || call.twilioSid || "").trim();
    if (!session?.beginSpeaking && sid) {
      const { client } = await getTwilioContextForUserId(call.userId);
      await client.calls(sid).update({
        twiml: buildSalesBotConnectTwiml({ origin, callId }),
      });
      session = await waitForSalesBotSession(callId, 8000);
    }

    if (!session?.beginSpeaking) {
      return waiting({
        error: "A person spoke. Connecting the bot on the direct call…",
        phase: "connecting",
        botAttached: false,
        speaking: false,
        answeredBy,
      });
    }

    const spoken = await beginSalesBotSpeech({ callId });
    if (!spoken?.ok) {
      return waiting({
        error: spoken?.error || "A person spoke. Connecting the bot…",
        phase: "connecting",
        botAttached: true,
        speaking: false,
        answeredBy,
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
      callMode: "direct",
    });
  } catch (err) {
    console.error("[sales-bot] attach failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to attach sales bot" },
      { status: 502 },
    );
  }
}
