import { NextResponse } from "next/server";
import {
  buildAddressBotConnectTwiml,
  loadCompanyAddressById,
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

export async function POST(req) {
  const url = new URL(req.url);
  const addressId = Number(url.searchParams.get("addressId"));
  const callId = Number(url.searchParams.get("callId"));
  const origin = getRequestBaseUrlFromRequest(req);

  if (!Number.isInteger(addressId) || addressId <= 0 || !Number.isInteger(callId) || callId <= 0) {
    return twimlResponse(hangupXml("Address bot is missing call details."));
  }

  const address = await loadCompanyAddressById(addressId);
  if (!address) {
    return twimlResponse(hangupXml("That address is no longer available."));
  }
  if (!origin) {
    return twimlResponse(hangupXml("Address bot is not reachable."));
  }

  return twimlResponse(
    buildAddressBotConnectTwiml({
      origin,
      addressId: address.id,
      callId,
      addressText: address.address,
    }),
  );
}

export async function GET(req) {
  return POST(req);
}
