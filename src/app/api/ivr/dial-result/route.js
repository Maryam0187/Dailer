import { NextResponse } from "next/server";
import { assertIvrSecret } from "@/server/ivr/parseIvrBody";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** Dial ended without a connected conversation — play callback message. */
const UNANSWERED = new Set(["busy", "no-answer", "failed", "canceled", "cancelled"]);

/**
 * Twilio Dial action callback.
 * Thanks / callback Say only when nobody answered. After a real conversation, just hang up.
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

  if (UNANSWERED.has(dialStatus)) {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXmlText(
    "We're sorry. All representatives are busy with other callers right now. Please try again later. Goodbye.",
  )}</Say>
  <Hangup/>
</Response>`);
  }

  // completed / answered — admin already spoke with caller; end quietly.
  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
}

export async function GET(req) {
  return POST(req);
}
