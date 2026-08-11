import { NextResponse } from "next/server";
import { getTwilioFromNumber } from "@/server/twilio";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { assertIvrSecret, parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyAdmins } from "@/server/ivr/notifyAdmins";
import { selectIvrTargets } from "@/server/ivr/selectIvrTargets";
import {
  buildIvrLoopQuery,
  busySayTwiml,
  dialAttemptSec,
  escapeXmlAttr,
  escapeXmlText,
  holdChunkSec,
  holdWaitLoopTwiml,
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

function contextFrom(req, body) {
  const url = new URL(req.url);
  return {
    from: body.from || url.searchParams.get("from") || null,
    to: body.to || url.searchParams.get("to") || null,
    callSid: body.callSid || url.searchParams.get("callSid") || null,
    choice: body.choice || url.searchParams.get("choice") || null,
    startedAt: Number(url.searchParams.get("startedAt")) || Date.now(),
    isFirstPass: !url.searchParams.has("startedAt"),
  };
}

function connectTwiml({ callerId, identities, attemptTimeout, actionUrl }) {
  const clients = identities
    .map((id) => `    <Client>${escapeXmlText(id)}</Client>`)
    .join("\n");
  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";
  const actionAttr = actionUrl
    ? ` action="${escapeXmlAttr(actionUrl)}" method="POST"`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeout="${attemptTimeout}" ringTone="us"${callerIdAttr}${actionAttr}>
${clients}
  </Dial>
</Response>`;
}

/**
 * Wait-loop entry:
 * - Online admin browsers → Dial with ringTone (first to answer wins)
 * - None online → hold/queue audio, Redirect here again until timeout
 * - dial-result no-answer → back here to retry / pick up newly online admins
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
  const baseUrl = publicBase(req);
  const totalSec = waitLoopTotalSec();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - ctx.startedAt) / 1000));
  const remainingSec = totalSec - elapsedSec;

  if (remainingSec <= 0) {
    return twimlResponse(busySayTwiml());
  }

  const targets = await selectIvrTargets();

  if (ctx.isFirstPass) {
    void notifyAdmins({
      type: "ringing",
      from: ctx.from,
      to: ctx.to,
      callSid: ctx.callSid,
      choice: ctx.choice,
    }).catch((err) => console.warn("[ivr/connect] notify", err?.message || err));
  }

  if (!baseUrl) {
    return twimlResponse(busySayTwiml());
  }

  const loopQs = buildIvrLoopQuery({
    startedAt: ctx.startedAt,
    from: ctx.from,
    to: ctx.to,
    callSid: ctx.callSid,
    choice: ctx.choice,
  });
  const reconnectUrl = `${baseUrl}/api/ivr/connect?${loopQs}`;

  // No admin browser online — play hold/queue, then re-enter wait-loop.
  // When an admin opens the dialer, the next pass Dials them with ringTone.
  if (!targets.length) {
    const chunk = Math.min(holdChunkSec(), Math.max(3, remainingSec));
    return twimlResponse(
      holdWaitLoopTwiml({
        redirectUrl: reconnectUrl,
        baseUrl,
        chunkSec: chunk,
      }),
    );
  }

  const attemptTimeout = Math.max(5, Math.min(dialAttemptSec(), remainingSec));

  // No time left for a meaningful Dial — brief gap then finish via dial-result path.
  if (attemptTimeout < 5) {
    return twimlResponse(busySayTwiml());
  }

  let callerId = "";
  try {
    callerId = getTwilioFromNumber();
  } catch {
    callerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "";
  }

  const actionUrl = `${baseUrl}/api/ivr/dial-result?${loopQs}`;

  return twimlResponse(
    connectTwiml({
      callerId,
      identities: targets.map((t) => t.identity),
      attemptTimeout,
      actionUrl,
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
