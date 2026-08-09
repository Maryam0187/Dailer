import { NextResponse } from "next/server";
import { getTwilioFromNumber } from "@/server/twilio";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { assertIvrSecret, parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyAdmins } from "@/server/ivr/notifyAdmins";
import { selectIvrTargets } from "@/server/ivr/selectIvrTargets";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function dialTimeoutSec() {
  const n = Number(process.env.IVR_DIAL_TIMEOUT_SEC);
  if (Number.isInteger(n) && n >= 5 && n <= 120) return n;
  return 45;
}

function fallbackTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXmlText(
    "Thank you. Our representative will call you shortly. Goodbye.",
  )}</Say>
  <Hangup/>
</Response>`;
}

function buildDialActionUrl(req) {
  const origin =
    getRequestBaseUrlFromRequest(req) ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ||
    "";
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
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXmlText("Please hold while we connect you to a representative.")}</Say>
  <Dial answerOnBridge="true" timeout="${timeout}"${callerIdAttr}${actionAttr}>
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

  void notifyAdmins({
    type: "ringing",
    from,
    to,
    callSid,
    choice,
    number,
  }).catch((err) => console.warn("[ivr/connect] notify", err?.message || err));

  if (!targets.length) {
    return twimlResponse(fallbackTwiml());
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
