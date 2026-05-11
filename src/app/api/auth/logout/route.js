import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import db from "@/server/db";

export async function POST() {
  // Logout is an explicit "end my session" — clear any active dialer lock for this user
  // BEFORE the auth cookie is removed so server-side getAuthedUser can still identify them.
  try {
    const authed = await getAuthedUser();
    if (authed?.id) {
      await db.User.update(
        { activeSessionId: null, activeSessionLastSeenAt: null },
        { where: { id: authed.id } },
      );
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
