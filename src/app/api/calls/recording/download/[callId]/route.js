import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
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
    const candidateUrls = [
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${callLog.recordingSid}.mp3`,
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${callLog.recordingSid}.wav`,
    ];

    let mediaRes = null;
    const attempts = [];
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
      attempts.push(`${url} -> ${res.status} (${ctype || "unknown"})`);
    }

    if (!mediaRes) {
      return NextResponse.json(
        { error: `Recording media unavailable. Attempts: ${attempts.join("; ")}` },
        { status: 404 },
      );
    }

    const safePhone = String(callLog.toNumber || "")
      .replace(/^\+/, "")
      .replace(/[^0-9]/g, "")
      .slice(0, 15);
    const phonePart = safePhone || "unknown-number";
    const filename = `recording-${phonePart}-call-${callLog.id}.mp3`;
    const contentType = mediaRes.headers.get("content-type") || "audio/mpeg";

    const bytes = await mediaRes.arrayBuffer();
    const fileBuffer = Buffer.from(bytes);
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
    return NextResponse.json(
      { error: err?.message || "Recording download failed unexpectedly" },
      { status: 500 },
    );
  }
}

