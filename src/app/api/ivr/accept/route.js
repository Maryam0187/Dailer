import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioFromNumber } from "@/server/twilio";

export const runtime = "nodejs";

/**
 * Admin accepts an inbound IVR Client ring — create CallLog so the dialer session can bind.
 */
export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const customerNumber =
    String(body?.from || body?.customerNumber || "").trim() || "unknown";
  const twilioNumber =
    String(body?.to || "").trim() ||
    (() => {
      try {
        return getTwilioFromNumber();
      } catch {
        return process.env.TWILIO_PHONE_NUMBER || "ivr";
      }
    })();
  const clientCallSid = String(body?.callSid || "").trim() || null;
  const parentCallSid = String(body?.parentCallSid || "").trim() || null;

  const call = await db.CallLog.create({
    userId: authedUser.id,
    fromNumber: twilioNumber,
    toNumber: customerNumber,
    direction: "inbound",
    status: "in-progress",
    callKind: "ivr",
    dialMode: "ivr_inbound",
    twilioSid: clientCallSid,
    customerCallSid: parentCallSid,
    contactName: "IVR caller",
  });

  return NextResponse.json({
    ok: true,
    callId: call.id,
    call,
  });
}
