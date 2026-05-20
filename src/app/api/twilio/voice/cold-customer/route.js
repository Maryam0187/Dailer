import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";

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
 * Customer-first cold dial: when PSTN answers, hold message then dial agent Client.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  if (!Number.isInteger(callId) || callId <= 0) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Invalid call reference.</Say><Hangup/></Response>`;
    return twimlResponse(xml);
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "fromNumber", "direction", "dialMode"],
    include: [{ model: db.User, as: "user", attributes: ["id", "username"] }],
  });

  if (!callLog || callLog.direction !== "outbound") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Call not found.</Say><Hangup/></Response>`;
    return twimlResponse(xml);
  }

  let clientIdentity;
  try {
    clientIdentity = getAgentClientIdentity(callLog.userId, callLog.user?.username);
  } catch {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Agent not available.</Say><Hangup/></Response>`;
    return twimlResponse(xml);
  }

  const callerId =
    String(callLog.fromNumber || "").trim() ||
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    "";
  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";

  const baseUrl = getRequestBaseUrlFromRequest(req);
  const agentStatusAttr = baseUrl
    ? ` statusCallback="${escapeXmlAttr(`${baseUrl}/api/twilio/agent-leg-status?callId=${callId}`)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you.</Say>
  <Dial answerOnBridge="true" timeout="20"${callerIdAttr}>
    <Client${agentStatusAttr ? ` ${agentStatusAttr}` : ""}>${escapeXmlAttr(clientIdentity)}</Client>
  </Dial>
</Response>`;

  return twimlResponse(xml);
}

export async function GET(req) {
  return POST(req);
}
