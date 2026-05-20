import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { getRequestBaseUrl } from "@/server/calls/requestBaseUrl";
import { applyCallLegUpdate } from "@/server/calls/callLegs";
import {
  getTwilioClient,
  getTwilioFromNumber,
  getTwilioStatusCallbackParamsWithFallback,
} from "@/server/twilio";

function buildColdCustomerVoiceUrl(baseUrl, callId) {
  const qs = new URLSearchParams({ callId: String(callId) });
  return `${baseUrl}/api/twilio/voice/cold-customer?${qs.toString()}`;
}

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
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
    callKind: "cold",
    dialMode: "customer_first",
    contactName: trimField(body?.contactName, 255),
    city: trimField(body?.city, 128),
    state: trimField(body?.state, 32),
    zipCode: trimField(body?.zipCode, 16),
    twilioSid: null,
    durationSeconds: null,
  });

  try {
    const client = getTwilioClient();
    const coldVoiceUrl = buildColdCustomerVoiceUrl(fallbackBaseUrl, call.id);
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });

    const customerLeg = await client.calls.create({
      to: normalizedToNumber,
      from: fromNumber,
      url: coldVoiceUrl,
      ...callbackParams,
    });

    const customerStatus = String(customerLeg.status || "queued").toLowerCase();
    await call.update({ twilioSid: customerLeg.sid || null });
    await applyCallLegUpdate(call, {
      source: "start-cold",
      leg: "customer",
      callSid: customerLeg.sid || null,
      status: customerStatus,
    });
  } catch (err) {
    await call.update({ status: "failed" }).catch(() => {});
    return NextResponse.json(
      { error: err?.message || "Failed to place cold call with Twilio" },
      { status: 502 },
    );
  }

  const refreshed = await call.reload();
  return NextResponse.json(
    {
      ok: true,
      call: refreshed,
      callMode: "cold",
      dialMode: "customer_first",
    },
    { status: 201 },
  );
}
