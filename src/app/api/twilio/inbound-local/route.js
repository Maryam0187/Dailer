import { NextResponse } from "next/server";
import { getTwilioFromNumber } from "@/server/twilio";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyAdmins } from "@/server/ivr/notifyAdmins";
import { selectIvrTargets } from "@/server/ivr/selectIvrTargets";
import {
  buildIvrLoopQuery,
  dialAttemptSec,
  holdChunkSec,
  waitLoopTotalSec,
} from "@/server/ivr/ivrRingTwiml";
import {
  busySayTwiml,
  localAdminDialTwiml,
  localHoldTwiml,
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

function contextFrom(req, body) {
  const url = new URL(req.url);
  return {
    from: body.from || url.searchParams.get("from") || null,
    to: body.to || url.searchParams.get("to") || null,
    callSid: body.callSid || url.searchParams.get("callSid") || null,
    startedAt: Number(url.searchParams.get("startedAt")) || Date.now(),
    isFirstPass: !url.searchParams.has("startedAt"),
  };
}

/**
 * Local company numbers (non–toll-free IVR): log caller + line, look up customer,
 * greet once, Dial online admins; if none online, short hold/retry then busy.
 * Does not use /api/ivr/connect or Studio.
 */
export async function POST(req) {
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

  if (!baseUrl) {
    return twimlResponse(busySayTwiml());
  }

  const loopQs = buildIvrLoopQuery({
    startedAt: ctx.startedAt,
    from: ctx.from,
    to: ctx.to,
    callSid: ctx.callSid,
  });
  const reconnectUrl = `${baseUrl}/api/twilio/inbound-local?${loopQs}`;

  const targets = await selectIvrTargets();

  // Single sequential notify per first pass (avoid parallel upsert race → duplicate rows).
  if (ctx.isFirstPass) {
    try {
      await notifyAdmins({
        type: targets.length ? "ringing" : "incoming",
        from: ctx.from,
        to: ctx.to,
        callSid: ctx.callSid,
      });
    } catch (err) {
      console.warn("[inbound-local] notify", err?.message || err);
    }
  }

  if (!targets.length) {
    const chunk = Math.min(holdChunkSec(), Math.max(3, remainingSec));
    return twimlResponse(
      localHoldTwiml({
        redirectUrl: reconnectUrl,
        baseUrl,
        chunkSec: chunk,
        includeGreeting: ctx.isFirstPass,
      }),
    );
  }

  const attemptTimeout = Math.max(5, Math.min(dialAttemptSec(), remainingSec));
  if (attemptTimeout < 5) {
    return twimlResponse(busySayTwiml());
  }

  let callerId = "";
  try {
    callerId = await getTwilioFromNumber();
  } catch {
    callerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "";
  }
  if (ctx.to) callerId = String(ctx.to).trim() || callerId;

  const actionUrl = `${baseUrl}/api/twilio/inbound-local/dial-result?${loopQs}`;

  return twimlResponse(
    localAdminDialTwiml({
      callerId,
      identities: targets.map((t) => t.identity),
      attemptTimeout,
      actionUrl,
      includeGreeting: ctx.isFirstPass,
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
