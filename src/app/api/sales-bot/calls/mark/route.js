import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";

export const runtime = "nodejs";

/**
 * Tag a Quick-Dial-style CallLog as Sales Bot immediately after /api/calls/start,
 * so it never appears in the main dialer call log while attach is still pending.
 */
export async function POST(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  if (String(body?.intent || "").trim() !== "sales_bot") {
    return NextResponse.json({ error: "intent must be sales_bot" }, { status: 400 });
  }

  const callId = Number(body?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "userId", "callKind", "dialMode"],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await call.update({ callKind: "sales_bot", dialMode: "sales_bot" });
  return NextResponse.json({ ok: true, callId: call.id, callKind: "sales_bot" });
}
