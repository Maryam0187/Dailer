import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  downloadRecordingBytes,
  finalizeCallRecording,
  isRecordingDownloadable,
} from "@/server/callRecording";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    const { callId: rawCallId } = await params;
    const authedUser = await getAuthedUser();
    if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const callId = Number(rawCallId);
    if (!Number.isInteger(callId) || callId <= 0) {
      return NextResponse.json({ error: "Invalid callId" }, { status: 400 });
    }

    const canSeeAllCalls =
      authedUser.role === "admin" ||
      authedUser.role === "manager" ||
      authedUser.role === "supervisor";
    const where = canSeeAllCalls ? { id: callId } : { id: callId, userId: authedUser.id };

    const callLog = await db.CallLog.findOne({
      where,
      attributes: ["id", "twilioSid", "recordingSid", "recordingStatus", "toNumber"],
    });
    if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });
    if (!callLog.recordingSid) {
      return NextResponse.json({ error: "Recording not available" }, { status: 404 });
    }

    if (!isRecordingDownloadable(callLog.recordingStatus)) {
      await finalizeCallRecording(callLog);
    }

    const { buffer: fileBuffer, contentType } = await downloadRecordingBytes(callLog.recordingSid);

    await db.CallLog.update(
      { recordingStatus: "completed" },
      { where: { id: callLog.id, recordingStatus: { [Op.ne]: "completed" } } },
    );

    const safePhone = String(callLog.toNumber || "")
      .replace(/^\+/, "")
      .replace(/[^0-9]/g, "")
      .slice(0, 15);
    const phonePart = safePhone || "unknown-number";
    const filename = `recording-${phonePart}-call-${callLog.id}.mp3`;

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", String(fileBuffer.length));
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Cache-Control", "no-store");
    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err?.message || "Recording download failed unexpectedly";
    const isProcessing = /processing|still processing/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isProcessing ? 409 : 500 },
    );
  }
}
