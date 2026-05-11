import { NextResponse } from "next/server";
import { Op } from "sequelize";
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

  const update = { recordingSid };
  if (recordingDuration != null && recordingDuration !== "") {
    const parsed = Number(recordingDuration);
    if (Number.isFinite(parsed)) update.recordingDurationSeconds = parsed;
  }

  // Twilio only fires this webhook for the events we subscribed to:
  // `in-progress`, `completed`, `absent`. We deliberately do NOT downgrade a
  // locally-set "paused" status back to "in-progress" if a late initial
  // event arrives after the agent already paused.
  const where =
    Number.isInteger(callId) && callId > 0
      ? { id: callId, recordingSid }
      : { recordingSid };

  if (recordingStatus === "in-progress") {
    await db.CallLog.update(update, {
      where: { ...where, recordingStatus: { [Op.ne]: "paused" } },
    });
    // Always persist duration updates even if we skipped the status change.
    if (update.recordingDurationSeconds != null) {
      await db.CallLog.update(
        { recordingDurationSeconds: update.recordingDurationSeconds },
        { where },
      );
    }
  } else {
    update.recordingStatus = recordingStatus;
    await db.CallLog.update(update, { where });
  }

  return new NextResponse("OK", { status: 200 });
}
