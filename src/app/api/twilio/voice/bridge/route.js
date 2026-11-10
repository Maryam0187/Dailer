import { NextResponse } from "next/server";
import db from "@/server/db";
import {
  buildConferenceTwiMl,
  buildConferenceStatusCallbackUrl,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";
import { dialSalesBotCustomer } from "@/server/calls/salesBotJoin";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

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
    attributes: [
      "id",
      "userId",
      "toNumber",
      "fromNumber",
      "direction",
      "callKind",
      "dialMode",
      "conferenceName",
      "customerCallSid",
    ],
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

  const baseUrl = getRequestBaseUrlFromRequest(req);
  const dialActionAttr = baseUrl
    ? ` action="${escapeXmlAttr(`${baseUrl}/api/twilio/dial-action?callId=${callId}`)}" method="POST"`
    : "";
  const numberStatusAttr = baseUrl
    ? ` statusCallback="${escapeXmlAttr(`${baseUrl}/api/twilio/customer-leg-status?callId=${callId}`)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
    : "";

  // Sales Bot: agent joins the conference. The bot is added later, only after a person is confirmed.
  const isSalesBot =
    String(callLog.callKind || "").trim() === "sales_bot" ||
    String(callLog.dialMode || "").trim() === "sales_bot";
  const salesConference = String(callLog.conferenceName || "").trim();
  if (isSalesBot && salesConference) {
    if (!String(callLog.customerCallSid || "").trim() && callerId && baseUrl) {
      try {
        const { client } = await getTwilioContextForUserId(callLog.userId);
        const customer = await dialSalesBotCustomer({
          client,
          toNumber: customerNumber,
          fromNumber: callerId,
          callId,
          origin: baseUrl,
        });
        if (customer.callSid) {
          await callLog.update({ customerCallSid: customer.callSid }).catch(() => {});
        }
      } catch (err) {
        console.error("[sales-bot] customer dial failed:", err?.message || err);
      }
    }
    const statusUrl = baseUrl ? buildConferenceStatusCallbackUrl(baseUrl) : "";
    return twimlResponse(
      buildConferenceTwiMl({
        conferenceName: salesConference,
        participant: "agent",
        callerId,
        statusCallbackUrl: statusUrl || undefined,
      }),
    );
  }

  const amdAttr =
    isSalesBot && baseUrl
      ? ` machineDetection="DetectMessageEnd" amdStatusCallback="${escapeXmlAttr(
          `${baseUrl}/api/twilio/sales-bot/amd?callId=${callId}`,
        )}" amdStatusCallbackMethod="POST"`
      : "";
  const numberAttrs = [numberStatusAttr, amdAttr].filter(Boolean).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeout="25"${callerIdAttr}${dialActionAttr}>
    <Number${numberAttrs}>${escapeXmlAttr(customerNumber)}</Number>
  </Dial>
</Response>`;
  return twimlResponse(xml);
}

export async function GET(req) {
  return POST(req);
}
