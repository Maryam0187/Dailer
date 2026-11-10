import { NextResponse } from "next/server";
import db from "@/server/db";
import { buildConferenceTwiMl } from "@/server/calls/conferenceVoice";
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
      attributes: [
        "id",
        "userId",
        "fromNumber",
        "conferenceName",
        "callKind",
        "dialMode",
        "answeredBy",
        "customerCallSid",
      ],
    });
    if (!call) return new NextResponse("OK", { status: 200 });

    const updates = {};
    if (answeredBy) updates.answeredBy = answeredBy.slice(0, 32);
    if (callSid && !call.customerCallSid) updates.customerCallSid = callSid;
    if (Object.keys(updates).length) {
      await call.update(updates);
    }

    const sid = callSid || String(call.customerCallSid || "").trim();
    const conferenceName = String(call.conferenceName || "").trim();
    const machineOrFax = answeredBy === "fax" || answeredBy.startsWith("machine");
    if (sid && (answeredBy === "human" || machineOrFax)) {
      try {
        const { client } = await getTwilioContextForUserId(call.userId);
        if (answeredBy === "human" && conferenceName) {
          await client.calls(sid).update({
            twiml: buildConferenceTwiMl({
              conferenceName,
              participant: "customer",
              callerId: call.fromNumber,
            }),
          });
        } else if (machineOrFax) {
          await client.calls(sid).update({ status: "completed" });
        }
      } catch (err) {
        console.error("[sales-bot] amd call update failed:", err?.message || err);
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
