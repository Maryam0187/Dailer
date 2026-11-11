import { NextResponse } from "next/server";
import db from "@/server/db";
import { buildSalesBotConnectTwiml } from "@/server/calls/salesBot";
import { getRequestBaseUrlFromRequest } from "@/server/calls/conferenceVoice";

export const runtime = "nodejs";

function twimlResponse(xml) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function hangupXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function waitXml(req) {
  const incoming = new URL(req.url);
  const waits = Number(incoming.searchParams.get("wait") || 0) + 1;
  if (waits > 20) return hangupXml();
  const base = getRequestBaseUrlFromRequest(req);
  const url = new URL(`${incoming.pathname}${incoming.search}`, base || incoming.origin);
  url.searchParams.set("wait", String(waits));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Redirect method="POST">${escapeXmlAttr(url.toString())}</Redirect>
</Response>`;
}

/**
 * Direct customer call. No conference. The bot TwiML is returned only when a person has spoken.
 */
export async function POST(req) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const callId = Number(url.searchParams.get("callId") || form?.get("callId"));
  const postedAnswer = String(form?.get("AnsweredBy") || "").trim().toLowerCase();
  const origin = getRequestBaseUrlFromRequest(req);

  if (!Number.isInteger(callId) || callId <= 0 || !origin) {
    return twimlResponse(hangupXml());
  }

  const call = await db.CallLog.findByPk(callId, {
    attributes: ["id", "answeredBy"],
  }).catch(() => null);
  if (!call) return twimlResponse(hangupXml());

  if (postedAnswer) {
    await call.update({ answeredBy: postedAnswer.slice(0, 32) }).catch((err) => {
      console.error("[sales-bot] customer-join answeredBy save failed:", err?.message || err);
    });
  }

  const answeredBy = postedAnswer || String(call.answeredBy || "").trim().toLowerCase();
  if (answeredBy === "human") {
    return twimlResponse(buildSalesBotConnectTwiml({ origin, callId }));
  }
  if (answeredBy === "fax" || answeredBy.startsWith("machine_end")) {
    return twimlResponse(hangupXml());
  }

  return twimlResponse(waitXml(req));
}

export async function GET(req) {
  return POST(req);
}
