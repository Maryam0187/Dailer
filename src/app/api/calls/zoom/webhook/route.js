import { NextResponse } from "next/server";
import { notifyZoomInboundCallbackOnce } from "@/server/ivr/notifyAdmins";
import {
  ZOOM_INBOUND_NOTIFY_EVENTS,
  buildZoomCrcResponse,
  extractZoomWebhookInbound,
  isNotifyableInboundFrom,
  verifyZoomWebhookSignature,
  zoomWebhookSecret,
} from "@/server/calls/zoomWebhook";

export const runtime = "nodejs";

/**
 * Zoom Marketplace Event Subscription endpoint.
 * - CRC: event === endpoint.url_validation (required before Zoom Save)
 * - Phone inbound: callee_ringing / missed / answered → same notify as Soft Embed / Twilio
 *
 * URL: POST {BASE}/api/calls/zoom/webhook
 * Env: ZOOM_WEBHOOK_SECRET_TOKEN = Marketplace app Secret Token
 */
export async function POST(req) {
  const secret = zoomWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "ZOOM_WEBHOOK_SECRET_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const timestamp = req.headers.get("x-zm-request-timestamp") || "";
  const signature = req.headers.get("x-zm-signature") || "";
  const event = String(body?.event || "");

  // Challenge-response check — must stay fast (< 3s).
  if (event === "endpoint.url_validation") {
    if (
      signature &&
      !verifyZoomWebhookSignature({ rawBody, signature, timestamp, secret })
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    const plainToken = body?.payload?.plainToken;
    if (!plainToken) {
      return NextResponse.json({ error: "plainToken required" }, { status: 400 });
    }
    return NextResponse.json(buildZoomCrcResponse(plainToken, secret));
  }

  if (!verifyZoomWebhookSignature({ rawBody, signature, timestamp, secret })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (ZOOM_INBOUND_NOTIFY_EVENTS.has(event)) {
    const { callId, from, to } = extractZoomWebhookInbound(body?.payload?.object);
    if (callId && isNotifyableInboundFrom(from)) {
      notifyZoomInboundCallbackOnce({
        from,
        to,
        zoomCallId: callId,
        eventType: "incoming",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
