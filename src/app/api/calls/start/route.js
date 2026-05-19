import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import {
  getTwilioClient,
  getTwilioFromNumber,
  getTwilioStatusCallbackParamsWithFallback,
} from "@/server/twilio";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";

function getRequestBaseUrl(req) {
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  const host = req.headers.get("host");
  if (host) {
    const isLocalHost =
      host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const protocol = isLocalHost ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return req?.nextUrl?.origin || null;
}

function buildBridgeVoiceUrl(baseUrl, callId) {
  const qs = new URLSearchParams({ callId: String(callId) });
  return `${baseUrl}/api/twilio/voice/bridge?${qs.toString()}`;
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const toNumber = body?.toNumber;
  const normalizedToNumber = normalizeToE164(toNumber);

  if (!toNumber || typeof toNumber !== "string" || !normalizedToNumber) {
    return NextResponse.json(
      { error: "toNumber must be a valid phone number (E.164 or US 10-digit)" },
      { status: 400 },
    );
  }

  const fromNumber = getTwilioFromNumber(body?.fromNumber);
  const fallbackBaseUrl = getRequestBaseUrl(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio voice webhook" },
      { status: 500 },
    );
  }

  const call = await db.CallLog.create({
    userId: authedUser.id,
    fromNumber,
    toNumber: normalizedToNumber,
    direction: "outbound",
    status: "initiated",
    twilioSid: null,
    durationSeconds: null,
  });

  let agentLeg = null;
  try {
    const client = getTwilioClient();
    const clientIdentity = getAgentClientIdentity(authedUser.id, authedUser.username);
    const bridgeVoiceUrl = buildBridgeVoiceUrl(fallbackBaseUrl, call.id);
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });

    // Option B: dial agent only; when they answer, bridge TwiML <Dial>s the customer (no Conference).
    agentLeg = await client.calls.create({
      to: `client:${clientIdentity}`,
      from: fromNumber,
      url: bridgeVoiceUrl,
      ...callbackParams,
    });

    await call.update({
      twilioSid: agentLeg.sid || null,
      status: agentLeg.status || "queued",
    });
  } catch (err) {
    await call.update({ status: "failed" }).catch(() => {});
    return NextResponse.json(
      {
        error: err?.message || "Failed to place call with Twilio",
      },
      { status: 502 },
    );
  }

  const refreshed = await call.reload();
  return NextResponse.json(
    {
      ok: true,
      call: refreshed,
      callMode: "direct",
    },
    { status: 201 },
  );
}
