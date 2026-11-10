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
 * Runs when the customer answers. They join the conference immediately so a
 * machine greeting is audible. The bot stays muted until AMD reports human.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const callId = Number(url.searchParams.get("callId") || form?.get("callId"));
  const postedAnswer = String(form?.get("AnsweredBy") || "").trim().toLowerCase();

  if (!Number.isInteger(callId) || callId <= 0) {
    return twimlResponse(hangupXml());
  }

  const call = await db.CallLog.findByPk(callId, {
    attributes: ["id", "conferenceName", "fromNumber", "answeredBy"],
  }).catch(() => null);
  if (!call) return twimlResponse(hangupXml());

  if (postedAnswer) {
    await call.update({ answeredBy: postedAnswer.slice(0, 32) }).catch((err) => {
      console.error("[sales-bot] customer-join answeredBy save failed:", err?.message || err);
    });
  }

  const answeredBy = postedAnswer || String(call.answeredBy || "").trim().toLowerCase();
  if (answeredBy === "fax" || answeredBy.startsWith("machine")) {
    return twimlResponse(hangupXml());
  }

  const conferenceName = String(call.conferenceName || "").trim();
  if (!conferenceName) return twimlResponse(hangupXml());

  return twimlResponse(
    buildConferenceTwiMl({
      conferenceName,
      participant: "customer",
      callerId: call.fromNumber,
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
