import { NextResponse } from "next/server";
import db from "@/server/db";
import { buildSalesBotConnectTwiml } from "@/server/calls/salesBot";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { isMachineAnsweredBy } from "@/server/calls/salesBotAnsweredBy";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

/**
 * Twilio AMD (Answering Machine Detection) callback for Sales Bot customer dials.
 * Form fields include AnsweredBy + CallSid.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const form = await req.formData().catch(() => null);
  const answeredBy = String(form?.get("AnsweredBy") || "").trim().toLowerCase();
  const callSid = String(form?.get("CallSid") || "").trim();

  if (!Number.isInteger(callId) || callId <= 0) {
    return new NextResponse("OK", { status: 200 });
  }

  try {
    const call = await db.CallLog.findByPk(callId, {
      attributes: ["id", "userId", "callKind", "dialMode", "answeredBy", "customerCallSid", "twilioSid"],
    });
    if (!call) return new NextResponse("OK", { status: 200 });

    const updates = {};
    if (answeredBy) updates.answeredBy = answeredBy.slice(0, 32);
    if (callSid && !call.customerCallSid) updates.customerCallSid = callSid;
    if (Object.keys(updates).length) {
      await call.update(updates);
    }

    const sid = callSid || String(call.customerCallSid || call.twilioSid || "").trim();
    const origin = getRequestBaseUrlFromRequest(req);
    if (sid && origin && answeredBy === "human") {
      try {
        const { client } = await getTwilioContextForUserId(call.userId);
        await client.calls(sid).update({
          twiml: buildSalesBotConnectTwiml({ origin, callId }),
        });
      } catch (err) {
        console.error("[sales-bot] direct bot connect failed:", err?.message || err);
      }
    } else if (sid && isMachineAnsweredBy(answeredBy)) {
      try {
        const { client } = await getTwilioContextForUserId(call.userId);
        await client.calls(sid).update({ status: "completed" });
      } catch (err) {
        console.error("[sales-bot] machine hangup failed:", err?.message || err);
      }
    }
  } catch (err) {
    console.error("[sales-bot] amd callback failed:", err?.message || err);
  }

  return new NextResponse("OK", { status: 200 });
}

export async function GET(req) {
  return POST(req);
}
