import { NextResponse } from "next/server";
import {
  buildAddressBotConnectTwiml,
} from "@/server/calls/addressBot";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function hangupXml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${message}</Say>
  <Hangup/>
</Response>`;
}

async function readBotParams(req) {
  const url = new URL(req.url);
  let callId = Number(url.searchParams.get("callId"));
  if (Number.isInteger(callId) && callId > 0) {
    return { callId };
  }

  const form = await req.formData().catch(() => null);
  callId = Number(form?.get("callId") || url.searchParams.get("callId"));
  return { callId };
}

export async function POST(req) {
  const { callId } = await readBotParams(req);
  const origin = getRequestBaseUrlFromRequest(req);

  if (!Number.isInteger(callId) || callId <= 0) {
    return twimlResponse(hangupXml("Address bot is missing call details."));
  }
  if (!origin) {
    return twimlResponse(hangupXml("Address bot is not reachable."));
  }

  return twimlResponse(
    buildAddressBotConnectTwiml({
      origin,
      callId,
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
