import { NextResponse } from "next/server";
import db from "@/server/db";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";
import { getWebhookBaseUrl } from "@/server/twilio";

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

/**
 * Outbound 1:1 bridge: when the agent answers their Client leg, Twilio fetches this
 * URL and we <Dial> the customer (no Conference — avoids conference participant billing).
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  if (!Number.isInteger(callId) || callId <= 0) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Invalid call reference.</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(xml);
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "toNumber", "fromNumber", "direction"],
  });

  if (!callLog || callLog.direction !== "outbound") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Call not found.</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(xml);
  }

  const customerNumber = String(callLog.toNumber || "").trim();
  if (!customerNumber) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">No destination number for this call.</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(xml);
  }

  const callerId =
    String(callLog.fromNumber || "").trim() ||
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    "";
  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";

  const baseUrl = getWebhookBaseUrl() || getRequestBaseUrlFromRequest(req);
  const customerStatusUrl = baseUrl
    ? `${baseUrl}/api/twilio/customer-leg-status?callId=${callId}`
    : "";
  const statusEvents = "initiated ringing answered completed";
  const dialActionAttr = baseUrl
    ? ` action="${escapeXmlAttr(`${baseUrl}/api/twilio/dial-action?callId=${callId}`)}" method="POST"`
    : "";
  const dialStatusAttr = customerStatusUrl
    ? ` statusCallback="${escapeXmlAttr(customerStatusUrl)}" statusCallbackMethod="POST" statusCallbackEvent="${statusEvents}"`
    : "";
  const numberStatusAttr = customerStatusUrl
    ? ` statusCallback="${escapeXmlAttr(customerStatusUrl)}" statusCallbackMethod="POST" statusCallbackEvent="${statusEvents}"`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeout="25"${callerIdAttr}${dialActionAttr}${dialStatusAttr}>
    <Number${numberStatusAttr ? ` ${numberStatusAttr}` : ""}>${escapeXmlAttr(customerNumber)}</Number>
  </Dial>
</Response>`;
  return twimlResponse(xml);
}

export async function GET(req) {
  return POST(req);
}
