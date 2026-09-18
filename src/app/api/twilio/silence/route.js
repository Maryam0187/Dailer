import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req) {
  const origin = new URL(req.url).origin;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="120"/>
  <Redirect method="GET">${origin}/api/twilio/silence</Redirect>
</Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(req) {
  return GET(req);
}
