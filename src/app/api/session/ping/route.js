import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { refreshSessionIfOwner } from "@/server/userSession";

export const runtime = "nodejs";

/**
 * Heartbeat for the active Dialer session. Refreshes the lock ONLY if this tab
 * still owns it. Does not create a lock — initial claim happens at
 * {@code /api/twilio/token}. Prevents the logout race where a ping landing
 * after release could re-acquire the row.
 */
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

  const result = await refreshSessionIfOwner(authedUser.id, sessionId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: "session_locked" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
