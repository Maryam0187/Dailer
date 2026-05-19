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
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "twilioSid", "recordingSid", "recordingStatus"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  const callSid = String(callLog.twilioSid || "").trim();
  if (!callSid) {
    return NextResponse.json(
      { error: "Call not connected yet. Try again in a few seconds." },
      { status: 409 },
    );
  }

  const status = String(callLog.recordingStatus || "").toLowerCase();
  if (callLog.recordingSid && status === "in-progress") {
    return NextResponse.json({ error: "Recording already in progress" }, { status: 409 });
  }

  try {
    const client = getTwilioClient();

    // Subsequent Start clicks just resume the same recording so the final
    // download is one file covering the whole call (with paused gaps skipped).
    if (callLog.recordingSid && status === "paused") {
      const recording = await client
        .calls(callSid)
        .recordings(callLog.recordingSid)
        .update({ status: "in-progress" });

      const nextStatus = recording.status || "in-progress";
      await db.CallLog.update(
        { recordingStatus: nextStatus },
        { where: { id: callId } },
      );

      return NextResponse.json({
        ok: true,
        resumed: true,
        recording: { sid: recording.sid, status: nextStatus },
      });
    }

    // First Start for this call: create the one and only Twilio recording.
    // pauseBehavior=skip means any later pauses are cut out (not silenced),
    // so the resulting MP3 only contains the audio the agent wanted captured.
    if (callLog.recordingSid && status && status !== "paused" && status !== "in-progress") {
      return NextResponse.json(
        {
          error: `Recording for this call is already ${status} and cannot be restarted.`,
        },
        { status: 409 },
      );
    }

    const fallbackBaseUrl = getRequestBaseUrl(req);
    if (!fallbackBaseUrl) {
      return NextResponse.json({ error: "Could not determine public app URL" }, { status: 500 });
    }
    const callbackUrl = `${fallbackBaseUrl}/api/twilio/recording-status?callId=${callId}`;
    const recording = await client.calls(callSid).recordings.create({
      recordingStatusCallback: callbackUrl,
      recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: ["in-progress", "completed", "absent"],
      recordingChannels: "mono",
      playBeep: true,
    });

    const nextStatus = recording.status || "in-progress";
    await db.CallLog.update(
      {
        recordingSid: recording.sid,
        recordingStatus: nextStatus,
        recordingDurationSeconds: null,
      },
      { where: { id: callId } },
    );

    return NextResponse.json({
      ok: true,
      resumed: false,
      recording: { sid: recording.sid, status: nextStatus },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to start call recording" },
      { status: 502 },
    );
  }
}
