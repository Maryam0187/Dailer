import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient } from "@/server/twilio";

export const runtime = "nodejs";

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

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  const conferenceName = String(body?.conferenceName || "").trim();
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }
  if (!conferenceName) {
    return NextResponse.json({ error: "conferenceName is required" }, { status: 400 });
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId, userId: authedUser.id },
    attributes: ["id", "recordingSid", "recordingStatus"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (callLog.recordingStatus === "in-progress") {
    return NextResponse.json({ error: "Recording already in progress" }, { status: 409 });
  }

  const fallbackBaseUrl = getRequestBaseUrl(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json({ error: "Could not determine public app URL" }, { status: 500 });
  }

  try {
    const client = getTwilioClient();
    const conferences = await client.conferences.list({
      friendlyName: conferenceName,
      status: "in-progress",
      limit: 1,
    });
    if (!conferences.length) {
      return NextResponse.json({ error: "Conference is not in progress" }, { status: 404 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return NextResponse.json({ error: "Twilio credentials not configured" }, { status: 500 });
    }

    const callbackUrl = `${fallbackBaseUrl}/api/twilio/recording-status?callId=${callId}`;
    const conferenceSid = conferences[0].sid;
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Conferences/${conferenceSid}/Recordings.json`;
    const form = new URLSearchParams({
      RecordingStatusCallback: callbackUrl,
      RecordingStatusCallbackMethod: "POST",
    });
    form.append("RecordingStatusCallbackEvent", "in-progress");
    form.append("RecordingStatusCallbackEvent", "completed");
    form.append("RecordingStatusCallbackEvent", "absent");

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const startRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const recording = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !recording?.sid) {
      throw new Error(recording?.message || "Failed to start conference recording");
    }

    await db.CallLog.update(
      {
        recordingSid: recording.sid,
        recordingStatus: recording.status || "in-progress",
      },
      { where: { id: callId } },
    );

    return NextResponse.json({
      ok: true,
      recording: {
        sid: recording.sid,
        status: recording.status || "in-progress",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to start conference recording" },
      { status: 502 },
    );
  }
}

