import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient, getTwilioFromNumber } from "@/server/twilio";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const toNumber = body?.toNumber;

  if (!toNumber || typeof toNumber !== "string") {
    return NextResponse.json({ error: "toNumber is required" }, { status: 400 });
  }

  const fromNumber = getTwilioFromNumber(body?.fromNumber);
  let twilioCall = null;
  try {
    const client = getTwilioClient();
    twilioCall = await client.calls.create({
      to: toNumber,
      from: fromNumber,
      // Placeholder TwiML URL for basic outbound initiation.
      // Replace with your own TwiML app/URL as needed.
      url: "http://demo.twilio.com/docs/voice.xml",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err?.message || "Failed to place call with Twilio",
      },
      { status: 502 },
    );
  }

  const call = await db.CallLog.create({
    userId: authedUser.id,
    fromNumber,
    toNumber,
    direction: "outbound",
    status: "queued",
    twilioSid: twilioCall?.sid || null,
    durationSeconds: null,
  });

  return NextResponse.json({ ok: true, call }, { status: 201 });
}

