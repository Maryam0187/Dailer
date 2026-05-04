import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";

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
  const agentUserIdParam = url.searchParams.get("agentUserId");
  let clientIdentity = "";
  if (agentUserIdParam != null && /^\d+$/.test(agentUserIdParam.trim())) {
    const uid = Number(agentUserIdParam.trim());
    const user = await db.User.findByPk(uid, { attributes: ["id", "username"] });
    if (user) {
      try {
        clientIdentity = getAgentClientIdentity(user.id, user.username);
      } catch {
        clientIdentity = "";
      }
    }
  }
  if (!clientIdentity) {
    clientIdentity = String(process.env.TWILIO_AGENT_CLIENT_IDENTITY || "").trim();
  }

  const agentNumber = String(process.env.TWILIO_AGENT_NUMBER || "").trim();

  if (!clientIdentity && !agentNumber) {
    const missingAgentXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Call routing is not configured. Set agent phone or browser client identity.</Say>
  <Hangup/>
</Response>`;
    return twimlResponse(missingAgentXml);
  }

  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";
  const dialTarget = clientIdentity
    ? `<Client>${escapeXmlAttr(clientIdentity)}</Client>`
    : `<Number>${escapeXmlAttr(agentNumber)}</Number>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true"${callerIdAttr}>
    ${dialTarget}
  </Dial>
</Response>`;
  return twimlResponse(xml);
}

export async function GET(req) {
  return POST(req);
}
