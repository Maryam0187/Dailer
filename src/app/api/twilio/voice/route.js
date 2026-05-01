import { NextResponse } from "next/server";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST() {
  // Basic voice flow for outbound API calls: when the callee answers,
  // Twilio executes this TwiML so the call is clearly connected.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your call from Dialer is now connected.</Say>
  <Pause length="1"/>
  <Say voice="alice">Thank you.</Say>
  <Hangup/>
</Response>`;
  return twimlResponse(xml);
}

export async function GET() {
  return POST();
}
