import { NextResponse } from "next/server";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { assertIvrSecret } from "@/server/ivr/parseIvrBody";
import {
  buildIvrLoopQuery,
  busySayTwiml,
  retryWaitLoopTwiml,
  waitGapSec,
  waitLoopTotalSec,
} from "@/server/ivr/ivrRingTwiml";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function publicBase(req) {
  return (
    getRequestBaseUrlFromRequest(req) ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    ""
  );
}

/** Dial ended without a connected conversation. */
const UNANSWERED = new Set(["busy", "no-answer", "failed", "canceled", "cancelled"]);

/**
 * Twilio Dial action callback for the IVR wait-loop.
 * - Answered / completed → quiet hangup
 * - No answer → short pause, Redirect to /api/ivr/connect to Dial again (admin may have logged in)
 * - Total wait exceeded → busy message
 */
export async function POST(req) {
  if (!assertIvrSecret(req)) {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
  }

  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const dialStatus = String(form?.get("DialCallStatus") || "")
    .trim()
    .toLowerCase();

  if (!UNANSWERED.has(dialStatus)) {
    // completed / answered — conversation already happened
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
  }

  const startedAt = Number(url.searchParams.get("startedAt")) || Date.now();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const remainingSec = waitLoopTotalSec() - elapsedSec;

  if (remainingSec <= 0) {
    return twimlResponse(busySayTwiml());
  }

  const baseUrl = publicBase(req);
  if (!baseUrl) {
    return twimlResponse(busySayTwiml());
  }

  const loopQs = buildIvrLoopQuery({
    startedAt,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    callSid: url.searchParams.get("callSid"),
    choice: url.searchParams.get("choice"),
    number: url.searchParams.get("number"),
  });

  const redirectUrl = `${baseUrl}/api/ivr/connect?${loopQs}`;
  const gap = Math.min(waitGapSec(), Math.max(0, remainingSec));

  return twimlResponse(
    retryWaitLoopTwiml({
      redirectUrl,
      gapSec: gap,
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
