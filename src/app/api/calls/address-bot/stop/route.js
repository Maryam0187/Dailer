import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ADDRESS_BOT_LABEL } from "@/server/calls/addressBot";
import { getTwilioClient } from "@/server/twilio";

export const runtime = "nodejs";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  const conferenceName = String(body?.conferenceName || "").trim();

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "conferenceName"],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = conferenceName || String(call.conferenceName || "").trim();
  if (!name) {
    return NextResponse.json({ ok: true, stopped: false });
  }

  try {
    const client = getTwilioClient();
    const matches = await client.conferences.list({
      friendlyName: name,
      status: "in-progress",
      limit: 1,
    });
    if (!matches.length) {
      return NextResponse.json({ ok: true, stopped: false });
    }

    const participants = await client.conferences(matches[0].sid).participants.list({ limit: 50 });
    const bot = participants.find(
      (p) => String(p.label || "").trim().toLowerCase() === ADDRESS_BOT_LABEL,
    );
    if (bot?.callSid) {
      await client.conferences(matches[0].sid).participants(bot.callSid).remove();
    }

    return NextResponse.json({ ok: true, stopped: Boolean(bot?.callSid) });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to stop address bot" },
      { status: 502 },
    );
  }
}
