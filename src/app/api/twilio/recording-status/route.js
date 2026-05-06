import { NextResponse } from "next/server";
import db from "@/server/db";

export const runtime = "nodejs";

function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "unknown";
  return status.toLowerCase();
}

export async function POST(req) {
  const form = await req.formData();
  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const recordingSid = String(form.get("RecordingSid") || "").trim();
  const recordingStatus = normalizeStatus(form.get("RecordingStatus"));
  const recordingDuration = form.get("RecordingDuration");

  if (!recordingSid) {
    return NextResponse.json({ error: "RecordingSid is required" }, { status: 400 });
  }

  const update = {
    recordingSid,
    recordingStatus,
  };
  if (recordingDuration != null && recordingDuration !== "") {
    const parsed = Number(recordingDuration);
    if (Number.isFinite(parsed)) {
      update.recordingDurationSeconds = parsed;
    }
  }

  if (Number.isInteger(callId) && callId > 0) {
    await db.CallLog.update(update, { where: { id: callId } });
  } else {
    await db.CallLog.update(update, { where: { recordingSid } });
  }
  return new NextResponse("OK", { status: 200 });
}

