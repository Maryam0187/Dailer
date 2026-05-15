import { NextResponse } from "next/server";
import db from "@/server/db";
import { finalizeCallRecording } from "@/server/callRecording";

export const runtime = "nodejs";

function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "unknown";
  return status.toLowerCase();
}

export async function POST(req) {
  const form = await req.formData();
  const callSid = form.get("CallSid");
  const callStatus = form.get("CallStatus");
  const callDuration = form.get("CallDuration");

  if (!callSid || typeof callSid !== "string") {
    return NextResponse.json({ error: "CallSid is required" }, { status: 400 });
  }

  const update = {
    status: normalizeStatus(callStatus),
  };
  if (callDuration != null && callDuration !== "") {
    const parsedDuration = Number(callDuration);
    if (Number.isFinite(parsedDuration)) {
      update.durationSeconds = parsedDuration;
    }
  }

  const normalizedStatus = normalizeStatus(callStatus);
  if (normalizedStatus === "completed") {
    const callLog = await db.CallLog.findOne({
      where: { twilioSid: callSid },
      attributes: ["id", "twilioSid", "recordingSid", "recordingStatus"],
    });
    if (callLog) {
      try {
        await finalizeCallRecording(callLog);
      } catch {
        // Status callback should still update call log even if recording finalize fails.
      }
    }
  }

  await db.CallLog.update(update, { where: { twilioSid: callSid } });
  return new NextResponse("OK", { status: 200 });
}
