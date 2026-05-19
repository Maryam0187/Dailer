import { NextResponse } from "next/server";
import {
  buildConferenceStatusCallbackUrl,
  buildConferenceTwiMl,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Conference TwiML — used for add-agent invites, transfers, and legacy multi-party calls.
 * Outbound 1:1 uses /api/twilio/voice/bridge (<Dial>) instead.
 */
export async function POST(req) {
  const form = await req.formData();
  const twilioFrom = String(form.get("From") || "").trim();
  const fallbackCallerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "";
  const callerId = twilioFrom || fallbackCallerId;

  const url = new URL(req.url);
  const conferenceName = String(url.searchParams.get("conferenceName") || "").trim();
  const participant = String(url.searchParams.get("participant") || "").trim().toLowerCase();
  const muteOnEntry = url.searchParams.get("muteOnEntry") === "1";

  if (!conferenceName) {
    const missingConferenceXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Conference name is required for call routing.</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(missingConferenceXml);
  }

  const origin = getRequestBaseUrlFromRequest(req);
  const statusCbUrl = origin ? buildConferenceStatusCallbackUrl(origin) : "";

  const xml = buildConferenceTwiMl({
    conferenceName,
    participant: participant || "agent",
    muteOnEntry,
    callerId,
    statusCallbackUrl: statusCbUrl || undefined,
  });
  return twimlResponse(xml);
}

export async function GET(req) {
  return POST(req);
}
