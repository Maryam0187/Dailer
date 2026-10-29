import { NextResponse } from "next/server";
import { assertIvrSecret, parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyInboundCallbackAsync } from "@/server/ivr/notifyAdmins";
import { thanksSayTwiml } from "@/server/ivr/ivrRingTwiml";

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
    choice: body.choice || url.searchParams.get("choice") || null,
    isFirstPass: !url.searchParams.has("startedAt"),
  };
}

/**
 * Toll-free Studio connect: notify staff only (no admin Client Dial).
 */
export async function POST(req) {
  if (!assertIvrSecret(req)) {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Unauthorized.</Say>
  <Hangup/>
</Response>`);
  }

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
      choice: ctx.choice,
    });
  }

  return twimlResponse(thanksSayTwiml());
}

export async function GET(req) {
  return POST(req);
}
