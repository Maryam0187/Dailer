import { NextResponse } from "next/server";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import {
  buildIvrLoopQuery,
  waitGapSec,
  waitLoopTotalSec,
} from "@/server/ivr/ivrRingTwiml";
import {
  busySayTwiml,
  retryWaitLoopTwiml,
  thanksSayTwiml,
} from "@/server/calls/localInboundTwiml";

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

const RETRYABLE = new Set(["no-answer", "failed", "canceled", "cancelled"]);
const DECLINED = new Set(["busy"]);

/**
 * Dial action for local inbound — does not use /api/ivr/dial-result.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const dialStatus = String(form?.get("DialCallStatus") || "")
    .trim()
    .toLowerCase();

  if (DECLINED.has(dialStatus)) {
    return twimlResponse(thanksSayTwiml());
  }

  if (!RETRYABLE.has(dialStatus)) {
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
  });

  const redirectUrl = `${baseUrl}/api/twilio/inbound-local?${loopQs}`;
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
