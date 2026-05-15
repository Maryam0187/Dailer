import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { finalizeCallRecording } from "@/server/callRecording";
import { getTwilioClient } from "@/server/twilio";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "twilioSid", "status", "recordingSid", "recordingStatus"],
  });
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const privileged =
    authedUser.role === "admin" ||
    authedUser.role === "manager" ||
    authedUser.role === "supervisor";
  const isOwner = call.userId === authedUser.id;
  const isInvitee = !!(await db.InviteDialLeg.findOne({
    where: { callLogId: callId, invitedUserId: authedUser.id },
    attributes: ["callSid"],
  }));
  if (!privileged && !isOwner && !isInvitee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!call.twilioSid) {
    return NextResponse.json({ ok: true, ended: false, reason: "missing_twilio_sid" }, { status: 200 });
  }

  try {
    await finalizeCallRecording(call);

    const client = getTwilioClient();
    await client.calls(call.twilioSid).update({ status: "completed" });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to end Twilio call" },
      { status: 502 },
    );
  }

  await call.update({ status: "completed" });
  return NextResponse.json({ ok: true, ended: true }, { status: 200 });
}

