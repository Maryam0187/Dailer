import { NextResponse } from "next/server";

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

export async function POST(req) {
  const form = await req.formData();
  const twilioFrom = String(form.get("From") || "").trim();
  const fallbackCallerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "";
  const callerId = twilioFrom || fallbackCallerId;

  const url = new URL(req.url);
  const conferenceName = String(url.searchParams.get("conferenceName") || "").trim();
  const participant = String(url.searchParams.get("participant") || "").trim().toLowerCase();

  if (!conferenceName) {
    const missingConferenceXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Conference name is required for call routing.</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(missingConferenceXml);
  }

  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";
  const startConferenceOnEnter = participant === "agent" ? "true" : "false";
  const endConferenceOnExit = participant === "customer" ? "true" : "false";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true"${callerIdAttr}>
    <Conference
      startConferenceOnEnter="${startConferenceOnEnter}"
      endConferenceOnExit="${endConferenceOnExit}"
      beep="false"
    >${escapeXmlAttr(conferenceName)}</Conference>
  </Dial>
</Response>`;
  return twimlResponse(xml);
}

export async function GET(req) {
  return POST(req);
}
