import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient } from "@/server/twilio";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callId = Number(params?.callId);
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

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  let mediaRes = null;
  try {
    const client = getTwilioClient();
    const recording = await client.recordings(callLog.recordingSid).fetch();
    const mediaUrlRaw = String(recording?.mediaUrl || "").trim();
    if (!mediaUrlRaw) {
      return NextResponse.json({ error: "Recording media URL is missing" }, { status: 404 });
    }

    const candidateUrls = Array.from(
      new Set([
        mediaUrlRaw,
        mediaUrlRaw.endsWith(".json") ? mediaUrlRaw.replace(/\.json$/i, ".mp3") : `${mediaUrlRaw}.mp3`,
        mediaUrlRaw.endsWith(".json") ? mediaUrlRaw.replace(/\.json$/i, ".wav") : `${mediaUrlRaw}.wav`,
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${callLog.recordingSid}.mp3`,
      ]),
    );

    const failureStatuses = [];
    for (const url of candidateUrls) {
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
        redirect: "follow",
      });
      const ctype = String(res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && (ctype.startsWith("audio/") || ctype.includes("octet-stream"))) {
        mediaRes = res;
        break;
      }
      failureStatuses.push(`${url} -> ${res.status} (${ctype || "unknown"})`);
    }

    if (!mediaRes) {
      return NextResponse.json(
        { error: `Recording media unavailable. Attempts: ${failureStatuses.join("; ")}` },
        { status: 404 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch recording media" },
      { status: 502 },
    );
  }
  const safePhone = String(callLog.toNumber || "")
    .replace(/^\+/, "")
    .replace(/[^0-9]/g, "")
    .slice(0, 15);
  const phonePart = safePhone || "unknown-number";
  const filename = `recording-${phonePart}-call-${callLog.id}.mp3`;
  const contentType = mediaRes.headers.get("content-type") || "audio/mpeg";
  const contentLength = mediaRes.headers.get("content-length");
  const acceptRanges = mediaRes.headers.get("accept-ranges");
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "no-store");
  if (!mediaRes.body) {
    const bytes = await mediaRes.arrayBuffer();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers,
    });
  }
  return new NextResponse(mediaRes.body, {
    status: 200,
    headers,
  });
}

