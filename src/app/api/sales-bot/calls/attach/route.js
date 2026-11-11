import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { getOpenAiApiKey, waitForSalesBotSession } from "@/server/calls/salesBot";
import {
  isHumanAnsweredBy,
  isMachineAnsweredBy,
} from "@/server/calls/salesBotAnsweredBy";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

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

function endedMessage(status, answeredBy) {
  if (isMachineAnsweredBy(answeredBy)) return machineMessage(answeredBy);
  if (answeredBy === "unknown") {
    return "Twilio could not tell who answered. The bot was not added.";
  }
  if (status === "no-answer") return "No answer. The bot was not added.";
  if (status === "busy") return "The line was busy. The bot was not added.";
  if (status === "failed") return "The call failed. The bot was not added.";
  if (status === "canceled" || status === "cancelled") {
    return "The call was canceled. The bot was not added.";
  }
  if (isHumanAnsweredBy(answeredBy)) return "Call ended.";
  return "Call ended before a person was confirmed.";
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
    };
  } catch {
    return null;
  }
}

/**
 * Status watch for the direct sales-bot call.
 * customer-join connects the bot. This route does not change the call.
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

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "status", "twilioSid", "customerCallSid", "answeredBy"],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const customerStatus = customerLeg?.status || String(call.status || "").toLowerCase();
  const terminal = TERMINAL.has(customerStatus) || TERMINAL.has(String(call.status || "").toLowerCase());

  if (isMachineAnsweredBy(answeredBy)) {
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

  if (terminal) {
    const status = TERMINAL.has(customerStatus)
      ? customerStatus
      : String(call.status || "").toLowerCase();
    const phase =
      status === "no-answer" || status === "busy" || status === "failed" ? status : "ended";
    return NextResponse.json({
      stop: true,
      error: endedMessage(status, answeredBy),
      phase,
      answeredBy: answeredBy || null,
      botAttached: isHumanAnsweredBy(answeredBy),
      speaking: false,
      retryable: false,
    });
  }

  if (!customerStatus || RINGING_CUSTOMER.has(customerStatus)) {
    return waiting({
      error: "Phone is ringing. The bot is not on the call.",
      phase: "ringing",
      botAttached: false,
      speaking: false,
      answeredBy: answeredBy || null,
      customerStatus,
    });
  }

  if (!isHumanAnsweredBy(answeredBy)) {
    return waiting({
      error: "Twilio is checking who answered. The bot stays off until a person is confirmed.",
      phase: "detecting",
      botAttached: false,
      speaking: false,
      answeredBy: answeredBy || null,
      customerStatus,
    });
  }

  const session = await waitForSalesBotSession(callId, 800);
  const speaking = Boolean(session?.speaking || session?.greetingStarted);
  if (!speaking) {
    return waiting({
      error: "A person answered. The bot is connecting.",
      phase: "connecting",
      botAttached: false,
      speaking: false,
      answeredBy,
      customerStatus,
      callMode: "direct",
    });
  }

  return NextResponse.json({
    ok: true,
    attached: true,
    botAttached: true,
    speaking: true,
    phase: "human",
    answeredBy,
    callMode: "direct",
  });
}
