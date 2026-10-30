import { NextResponse } from "next/server";
import { parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyInboundCallbackAsync } from "@/server/ivr/notifyAdmins";
import { localNotifyOnlyTwiml } from "@/server/calls/localInboundTwiml";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function contextFrom(req, body) {
  const url = new URL(req.url);
  return {
    from: body.from || url.searchParams.get("from") || null,
    to: body.to || url.searchParams.get("to") || null,
    callSid: body.callSid || url.searchParams.get("callSid") || null,
    isFirstPass: !url.searchParams.has("startedAt"),
  };
}

/**
 * Local company numbers: notify staff (socket + push), no Client Dial.
 */
export async function POST(req) {
  let body = {};
  try {
    body = await parseIvrBody(req);
  } catch {
    body = {};
  }

  const ctx = contextFrom(req, body);

  if (ctx.isFirstPass) {
    notifyInboundCallbackAsync({
      type: "incoming",
      from: ctx.from,
      to: ctx.to,
      callSid: ctx.callSid,
      voiceProvider: "twilio",
    });
  }

  return twimlResponse(localNotifyOnlyTwiml());
}

export async function GET(req) {
  return POST(req);
}
