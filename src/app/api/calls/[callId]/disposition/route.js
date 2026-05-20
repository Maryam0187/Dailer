import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

const ALLOWED_DISPOSITIONS = new Set([
  "no_answer",
  "busy",
  "voicemail",
  "not_interested",
  "wrong_number",
  "callback",
  "interested",
  "completed",
  "other",
]);

export async function POST(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callId = Number(params?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const disposition = String(body?.disposition || "").trim().toLowerCase();
  if (!ALLOWED_DISPOSITIONS.has(disposition)) {
    return NextResponse.json({ error: "Invalid disposition" }, { status: 400 });
  }

  const call = await db.CallLog.findByPk(callId);
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (call.userId !== authedUser.id && authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await call.update({
    disposition,
    dispositionAt: new Date(),
  });

  return NextResponse.json({ ok: true, call: await call.reload() });
}
