import { NextResponse } from "next/server";
import db from "@/server/db";
import {
  buildConferenceTwiMl,
  buildConferenceStatusCallbackUrl,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";

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
 * Softphone answered. Sales Bot stays on Dial (with AMD) until a person is confirmed.
 * After upgrade, conferenceName is set and the agent rejoins the conference.
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

  const isSalesBot =
    String(callLog.callKind || "").trim() === "sales_bot" ||
    String(callLog.dialMode || "").trim() === "sales_bot";
  const salesConference = String(callLog.conferenceName || "").trim();

  // After human confirmation the call was upgraded. Softphone rejoins the conference.
  if (isSalesBot && salesConference) {
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

  // Sales Bot: AMD on Dial <Number> (conference participants cannot detect human).
  // Enable returns human / machine_start quickly. Attach waits a short grace period
  // so hold tones do not get the bot immediately; then attaches if still live.
  const amdAttr =
    isSalesBot && baseUrl
      ? [
          ` machineDetection="Enable"`,
          ` machineDetectionTimeout="5"`,
          ` machineDetectionSpeechThreshold="2400"`,
          ` machineDetectionSpeechEndThreshold="1200"`,
          ` machineDetectionSilenceTimeout="3000"`,
          ` amdStatusCallback="${escapeXmlAttr(`${baseUrl}/api/twilio/sales-bot/amd?callId=${callId}`)}"`,
          ` amdStatusCallbackMethod="POST"`,
        ].join("")
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
