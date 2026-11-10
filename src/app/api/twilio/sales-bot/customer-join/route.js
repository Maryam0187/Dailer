import { NextResponse } from "next/server";
import db from "@/server/db";
import { buildConferenceTwiMl } from "@/server/calls/conferenceVoice";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function hangupXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
}

/**
 * Synchronous AMD posts AnsweredBy here after the customer answers.
 * Only a human is placed in the conference. The bot stays silent until that result is saved.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const callId = Number(url.searchParams.get("callId") || form?.get("callId"));
  const answeredBy = String(form?.get("AnsweredBy") || "").trim().toLowerCase();

  if (!Number.isInteger(callId) || callId <= 0) {
    return twimlResponse(hangupXml());
  }

  const call = await db.CallLog.findByPk(callId, {
    attributes: ["id", "conferenceName", "fromNumber", "answeredBy"],
  }).catch(() => null);
  if (!call) return twimlResponse(hangupXml());

  if (answeredBy) {
    await call.update({ answeredBy: answeredBy.slice(0, 32) }).catch((err) => {
      console.error("[sales-bot] customer-join answeredBy save failed:", err?.message || err);
    });
  }

  const conferenceName = String(call.conferenceName || "").trim();
  if (answeredBy === "human" && conferenceName) {
    return twimlResponse(
      buildConferenceTwiMl({
        conferenceName,
        participant: "customer",
        callerId: call.fromNumber,
      }),
    );
  }

  return twimlResponse(hangupXml());
}

export async function GET(req) {
  return POST(req);
}
