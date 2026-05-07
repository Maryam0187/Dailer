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
    where: { id: callId, userId: authedUser.id },
    attributes: ["id", "twilioSid", "recordingSid", "recordingStatus"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (!callLog.recordingSid) {
    return NextResponse.json({ error: "No recording found for this call" }, { status: 404 });
  }

  try {
    const client = getTwilioClient();
    const callSid = String(callLog.twilioSid || "").trim();
    if (!callSid) {
      return NextResponse.json(
        { error: "Call customer leg not established yet." },
        { status: 409 },
      );
    }
    const recording = await client
      .calls(callSid)
      .recordings(callLog.recordingSid)
      .update({ status: "stopped" });

    await db.CallLog.update(
      { recordingStatus: recording.status || "stopped" },
      { where: { id: callId } },
    );

    return NextResponse.json({
      ok: true,
      recording: { sid: recording.sid, status: recording.status || "stopped" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to stop recording" },
      { status: 502 },
    );
  }
}

