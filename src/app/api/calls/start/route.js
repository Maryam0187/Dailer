import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  getTwilioCallCreateParams,
  getTwilioClient,
  getTwilioFromNumber,
  getTwilioStatusCallbackParamsWithFallback,
} from "@/server/twilio";

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

function normalizeToE164(rawNumber) {
  const input = String(rawNumber || "").trim();
  if (!input) return null;

  if (input.startsWith("+")) {
    const normalized = `+${input.slice(1).replace(/\D/g, "")}`;
    return normalized.length >= 8 ? normalized : null;
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
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
  let twilioCall = null;
  try {
    const client = getTwilioClient();
    const flowParams = getTwilioCallCreateParams({
      fallbackBaseUrl,
      agentUserId: authedUser.id,
    });
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });
    twilioCall = await client.calls.create({
      to: normalizedToNumber,
      from: fromNumber,
      ...flowParams,
      ...callbackParams,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err?.message || "Failed to place call with Twilio",
      },
      { status: 502 },
    );
  }

  const call = await db.CallLog.create({
    userId: authedUser.id,
    fromNumber,
    toNumber: normalizedToNumber,
    direction: "outbound",
    status: twilioCall?.status || "queued",
    twilioSid: twilioCall?.sid || null,
    durationSeconds: null,
  });

  return NextResponse.json({ ok: true, call }, { status: 201 });
}

