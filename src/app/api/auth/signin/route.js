import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import db from "@/server/db";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { isLoginAllowed, getSessionCalendarDate, loginWindowErrorMessage, isLeaveDay, isManuallyActive } from "@/server/auth/loginWindow";
import { getShiftSettingsRecord } from "@/server/auth/shiftSettings";

export async function POST(req) {
  await getShiftSettingsRecord();

  const body = await req.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const user = await db.User.findOne({ where: { username } });
  if (!user) {
    await logUserActivity({
      req,
      action: "login_failed",
      metadata: { username, reason: "unknown_user" },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.isActive === false) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "login_failed",
      metadata: { username, reason: "deactivated" },
    });
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "login_failed",
      metadata: { username, reason: "invalid_password" },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!isLoginAllowed(user)) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "login_failed",
      metadata: {
        username,
        reason: isLeaveDay()
          ? "leave_day"
          : !isManuallyActive()
            ? "shift_manually_ended"
            : "outside_login_window",
      },
    });
    return NextResponse.json({ error: loginWindowErrorMessage() }, { status: 403 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  // Single-session enforcement: every successful login mints a fresh sid and
  // overwrites the DB row. Any older cookie still holding the previous sid
  // becomes stale and is rejected by getAuthedUser on its next request.
  const sid = crypto.randomUUID();
  const sessionDay = getSessionCalendarDate();
  await user.update({ activeSessionId: sid, activeSessionLastSeenAt: new Date() });

  const { locationAlert } = await logUserActivity({
    req,
    userId: user.id,
    action: "login_success",
    sessionId: sid,
    metadata: { username: user.username, sessionDay },
  });

  const token = jwt.sign({ sub: user.id, role: user.role, sid, sessionDay }, secret, {
    expiresIn: "7d",
  });

  const res = NextResponse.json({
    ok: true,
    locationAlert: locationAlert || null,
  });
  res.cookies.set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
