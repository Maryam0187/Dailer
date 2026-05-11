import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient } from "@/server/twilio";

export const runtime = "nodejs";

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
  if (!callLog.recordingSid) {
    return NextResponse.json({ error: "No recording found for this call" }, { status: 404 });
  }

  const callSid = String(callLog.twilioSid || "").trim();
  if (!callSid) {
    return NextResponse.json(
      { error: "Call customer leg not established yet." },
      { status: 409 },
    );
  }

  const status = String(callLog.recordingStatus || "").toLowerCase();
  if (status === "paused") {
    return NextResponse.json(
      { ok: true, recording: { sid: callLog.recordingSid, status: "paused" } },
    );
  }
  if (status && status !== "in-progress") {
    return NextResponse.json(
      { error: `Recording for this call is already ${status}.` },
      { status: 409 },
    );
  }

  try {
    const client = getTwilioClient();

    // Pause (not stop) so a later Start can resume the SAME RecordingSid.
    // pauseBehavior=skip drops the paused span entirely from the final media,
    // so the downloadable MP3 only contains the recorded portions.
    const recording = await client
      .calls(callSid)
      .recordings(callLog.recordingSid)
      .update({ status: "paused", pauseBehavior: "skip" });

    const nextStatus = recording.status || "paused";
    await db.CallLog.update(
      { recordingStatus: nextStatus },
      { where: { id: callId } },
    );

    return NextResponse.json({
      ok: true,
      recording: { sid: recording.sid, status: nextStatus },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to pause recording" },
      { status: 502 },
    );
  }
}
