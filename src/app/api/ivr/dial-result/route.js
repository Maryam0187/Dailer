import { NextResponse } from "next/server";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { assertIvrSecret } from "@/server/ivr/parseIvrBody";
import { unansweredAfterDialTwiml } from "@/server/ivr/ivrRingTwiml";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** Dial ended without a connected conversation. */
const UNANSWERED = new Set(["busy", "no-answer", "failed", "canceled", "cancelled"]);

/**
 * Twilio Dial action callback.
 * If nobody answered (incl. unregistered Devices that fail fast), fill remaining
 * ring time with ringback audio, then play the busy message.
 * After a real conversation, hang up quietly.
 */
export async function POST(req) {
  if (!assertIvrSecret(req)) {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
  }

  const form = await req.formData().catch(() => null);
  const dialStatus = String(form?.get("DialCallStatus") || "")
    .trim()
    .toLowerCase();
  const dialCallDurationSec = Number(form?.get("DialCallDuration") || 0);

  if (UNANSWERED.has(dialStatus)) {
    const baseUrl =
      getRequestBaseUrlFromRequest(req) ||
      process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "";
    return twimlResponse(
      unansweredAfterDialTwiml({
        baseUrl,
        dialCallDurationSec,
      }),
    );
  }

  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
}

export async function GET(req) {
  return POST(req);
}
