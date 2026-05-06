import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callId = Number(params?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "Invalid callId" }, { status: 400 });
  }

  const canSeeAllCalls = authedUser.role === "admin" || authedUser.role === "manager";
  const where = canSeeAllCalls ? { id: callId } : { id: callId, userId: authedUser.id };

  const callLog = await db.CallLog.findOne({
    where,
    attributes: ["id", "recordingSid", "toNumber"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (!callLog.recordingSid) {
    return NextResponse.json({ error: "Recording not available" }, { status: 404 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio credentials not configured" }, { status: 500 });
  }

  const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${callLog.recordingSid}.mp3`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const twilioRes = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!twilioRes.ok) {
    return NextResponse.json({ error: "Recording media is not ready yet" }, { status: 404 });
  }

  const bytes = await twilioRes.arrayBuffer();
  const safePhone = String(callLog.toNumber || "")
    .replace(/^\+/, "")
    .replace(/[^0-9]/g, "")
    .slice(0, 15);
  const phonePart = safePhone || "unknown-number";
  const filename = `recording-${phonePart}-call-${callLog.id}.mp3`;
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

