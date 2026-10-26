import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

export async function POST(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  if (String(body?.intent || "").trim() !== "sales_bot") {
    return NextResponse.json({ error: "intent must be sales_bot" }, { status: 400 });
  }
  const callId = Number(body?.callId);
  const conferenceName = String(body?.conferenceName || "").trim();

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: [
      "id",
      "userId",
      "conferenceName",
      "twilioSid",
      "customerCallSid",
      "callKind",
      "dialMode",
    ],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Never tear down a normal dialer call through this endpoint.
  const kind = String(call.callKind || "").trim();
  const dialMode = String(call.dialMode || "").trim();
  if (kind !== "sales_bot" && dialMode !== "sales_bot") {
    return NextResponse.json(
      { error: "Not a Sales Bot call. Use the dialer hangup instead." },
      { status: 409 },
    );
  }

  const name = conferenceName || String(call.conferenceName || "").trim();

  try {
    const { client } = await getTwilioContextForUserId(call.userId);

    if (name) {
      const matches = await client.conferences.list({
        friendlyName: name,
        status: "in-progress",
        limit: 1,
      });
      if (matches.length) {
        await client.conferences(matches[0].sid).update({ status: "completed" }).catch(() => {});
      }
    }

    for (const sid of [call.twilioSid, call.customerCallSid]) {
      if (!sid) continue;
      await client.calls(sid).update({ status: "completed" }).catch(() => {});
    }

    await call.update({ status: "completed" }).catch(() => {});
    return NextResponse.json({ ok: true, stopped: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to stop sales bot call" },
      { status: 502 },
    );
  }
}
