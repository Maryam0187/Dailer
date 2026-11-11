import { NextResponse } from "next/server";
import db from "@/server/db";
import { buildSalesBotConnectTwiml } from "@/server/calls/salesBot";
import { isHumanAnsweredBy } from "@/server/calls/salesBotAnsweredBy";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function hangupXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
}

/**
 * Twilio requests this only after synchronous AMD.
 * A person gets the bot on this same call. Anything else hangs up.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const callId = Number(url.searchParams.get("callId") || form?.get("callId"));
  const answeredBy = String(form?.get("AnsweredBy") || "").trim().toLowerCase();
  const origin = getRequestBaseUrlFromRequest(req);

  if (Number.isInteger(callId) && callId > 0 && answeredBy) {
    await db.CallLog.update(
      { answeredBy: answeredBy.slice(0, 32) },
      { where: { id: callId } },
    ).catch((err) => {
      console.error("[sales-bot] customer-join answeredBy save failed:", err?.message || err);
    });
  }

  if (isHumanAnsweredBy(answeredBy) && origin && Number.isInteger(callId) && callId > 0) {
    return twimlResponse(buildSalesBotConnectTwiml({ origin, callId }));
  }

  return twimlResponse(hangupXml());
}

export async function GET(req) {
  return POST(req);
}
