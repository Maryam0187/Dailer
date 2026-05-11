import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { acquireOrRefreshSession } from "@/server/userSession";

export const runtime = "nodejs";

/** Heartbeat for the active Dialer session. Returns 409 if another tab/device owns it. */
export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const claim = await acquireOrRefreshSession(authedUser.id, sessionId);
  if (!claim.ok) {
    return NextResponse.json({ ok: false, code: "session_locked" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
