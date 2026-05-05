import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
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

function buildVoiceUrl(baseUrl, conferenceName, participant) {
  const qs = new URLSearchParams({ conferenceName, participant });
  return `${baseUrl}/api/twilio/voice?${qs.toString()}`;
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  const conferenceName = String(body?.conferenceName || "").trim();
  const toNumber = String(body?.toNumber || "");
  const normalizedToNumber = normalizeToE164(toNumber);

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }
  if (!conferenceName) {
    return NextResponse.json({ error: "conferenceName is required" }, { status: 400 });
  }
  if (!normalizedToNumber) {
    return NextResponse.json(
      { error: "toNumber must be a valid phone number (E.164 or US 10-digit)" },
      { status: 400 },
    );
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId, userId: authedUser.id },
    attributes: ["id", "userId"],
  });
  if (!callLog) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const fallbackBaseUrl = getRequestBaseUrl(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio voice webhook" },
      { status: 500 },
    );
  }

  try {
    const client = getTwilioClient();
    const fromNumber = getTwilioFromNumber();
    const transferVoiceUrl = buildVoiceUrl(fallbackBaseUrl, conferenceName, "transfer");
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });
    const transferLeg = await client.calls.create({
      to: normalizedToNumber,
      from: fromNumber,
      url: transferVoiceUrl,
      ...callbackParams,
    });
    return NextResponse.json(
      {
        ok: true,
        transfer: {
          sid: transferLeg.sid,
          toNumber: normalizedToNumber,
          status: transferLeg.status,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to start warm transfer call" },
      { status: 502 },
    );
  }
}

