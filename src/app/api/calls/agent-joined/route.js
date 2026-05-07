import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { emitToUser } from "@/server/socketHub";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "toNumber"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  const ownerUserId = Number(callLog.userId);
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
    return NextResponse.json({ ok: true, notified: false });
  }

  if (ownerUserId === Number(authedUser.id)) {
    return NextResponse.json({ ok: true, notified: false });
  }

  const notified = emitToUser(ownerUserId, "call:agent-joined", {
    callId,
    joinedAgent: authedUser.username || "Agent",
    customer: callLog.toNumber || null,
    joinedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, notified });
}

