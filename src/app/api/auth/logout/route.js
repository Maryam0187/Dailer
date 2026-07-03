import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import db from "@/server/db";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { userHasActiveCall } from "@/server/calls/userActiveCall";

export async function POST(req) {
  // Logout is an explicit "end my session" — clear any active dialer lock for this user
  // BEFORE the auth cookie is removed so server-side getAuthedUser can still identify them.
  try {
    const authed = await getAuthedUser();
    if (authed?.id) {
      if (await userHasActiveCall(authed.id)) {
        return NextResponse.json(
          { error: "You cannot sign out while on an active call. End the call first." },
          { status: 409 },
        );
      }
      const userRow = await db.User.findByPk(authed.id, {
        attributes: ["id", "activeSessionId"],
      });
      await db.User.update(
        { activeSessionId: null, activeSessionLastSeenAt: new Date() },
        { where: { id: authed.id } },
      );
      await logUserActivity({
        req,
        userId: authed.id,
        action: "logout",
        sessionId: userRow?.activeSessionId ?? null,
      });
    }
  } catch {
    /* non-fatal: cookie is cleared next, and stale-lock TTL will recover the row */
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return res;
}
