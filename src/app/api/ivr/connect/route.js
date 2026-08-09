import { NextResponse } from "next/server";
import { getTwilioFromNumber } from "@/server/twilio";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { assertIvrSecret, parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyAdmins } from "@/server/ivr/notifyAdmins";
import { selectIvrTargets } from "@/server/ivr/selectIvrTargets";
import {
  busyWithFullRingTwiml,
  dialTimeoutSec,
  escapeXmlAttr,
  escapeXmlText,
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

function buildDialActionUrl(req) {
  const origin = publicBase(req);
  if (!origin) return "";
  const secret = process.env.IVR_WEBHOOK_SECRET?.trim();
  const qs = secret ? `?secret=${encodeURIComponent(secret)}` : "";
  return `${origin}/api/ivr/dial-result${qs}`;
}

function connectTwiml({ callerId, identities, timeout, actionUrl }) {
  const clients = identities
    .map((id) => `    <Client>${escapeXmlText(id)}</Client>`)
    .join("\n");
  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";
  const actionAttr = actionUrl
    ? ` action="${escapeXmlAttr(actionUrl)}" method="POST"`
    : "";
  // ringTone = ringing while Dial runs. If Clients are unregistered, Dial often
  // ends in a few seconds; dial-result then plays more ringback up to timeout.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeout="${timeout}" ringTone="us"${callerIdAttr}${actionAttr}>
${clients}
  </Dial>
</Response>`;
}

export async function POST(req) {
  if (!assertIvrSecret(req)) {
    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Unauthorized.</Say>
  <Hangup/>
</Response>`);
  }

  const url = new URL(req.url);
  let body = {};
  try {
    body = await parseIvrBody(req);
  } catch {
    body = {};
  }

  const from = body.from || url.searchParams.get("from") || null;
  const to = body.to || url.searchParams.get("to") || null;
  const callSid = body.callSid || url.searchParams.get("callSid") || null;
  const choice = body.choice || url.searchParams.get("choice") || null;
  const number = body.number || url.searchParams.get("number") || null;

  const targets = await selectIvrTargets();
  const baseUrl = publicBase(req);

  void notifyAdmins({
    type: "ringing",
    from,
    to,
    callSid,
    choice,
    number,
  }).catch((err) => console.warn("[ivr/connect] notify", err?.message || err));

  if (!targets.length) {
    return twimlResponse(busyWithFullRingTwiml(baseUrl));
  }

  let callerId = "";
  try {
    callerId = getTwilioFromNumber();
  } catch {
    callerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "";
  }

  return twimlResponse(
    connectTwiml({
      callerId,
      identities: targets.map((t) => t.identity),
      timeout: dialTimeoutSec(),
      actionUrl: buildDialActionUrl(req),
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
