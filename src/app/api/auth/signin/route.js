import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import db from "@/server/db";
import { logUserActivity } from "@/server/activity/logUserActivity";
import {
  isLoginAllowed,
  getSessionCalendarDate,
  loginWindowErrorMessage,
  isLeaveDay,
  isManuallyActive,
} from "@/server/auth/loginWindow";
import { hasAfterShiftGrant } from "@/server/auth/loginWindow.core.cjs";
import { getShiftSettingsRecord } from "@/server/auth/shiftSettings";
import { isUserOnApprovedLeave } from "@/server/leave/userLeave";

export async function POST(req) {
  await getShiftSettingsRecord();

  const body = await req.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;
  const purpose = body?.purpose === "leave_application" ? "leave_application" : "full";

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const user = await db.User.findOne({ where: { username } });
  if (!user) {
    await logUserActivity({
      req,
      action: "login_failed",
      metadata: { username, reason: "unknown_user", purpose },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.isActive === false) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "login_failed",
      metadata: { username, reason: "deactivated", purpose },
    });
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "login_failed",
      metadata: { username, reason: "invalid_password", purpose },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (purpose === "full") {
    const onApprovedLeave = await isUserOnApprovedLeave(user.id);
    if (onApprovedLeave && user.role !== "admin" && !hasAfterShiftGrant(user)) {
      await logUserActivity({
        req,
        userId: user.id,
        action: "login_failed",
        metadata: { username, reason: "user_on_leave" },
      });
      return NextResponse.json(
        { error: "You are on approved leave today and cannot sign in." },
        { status: 403 },
      );
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
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  const sid = crypto.randomUUID();
  const sessionDay = getSessionCalendarDate();
  await user.update({ activeSessionId: sid, activeSessionLastSeenAt: new Date() });

  const { locationAlert } = await logUserActivity({
    req,
    userId: user.id,
    action: purpose === "leave_application" ? "leave_application_login" : "login_success",
    sessionId: sid,
    metadata: { username: user.username, sessionDay, purpose },
  });

  const tokenPayload = {
    sub: user.id,
    role: user.role,
    sid,
    sessionDay,
  };
  if (purpose === "leave_application") {
    tokenPayload.purpose = "leave_application";
  }

  const token = jwt.sign(tokenPayload, secret, {
    expiresIn: "7d",
  });

  const res = NextResponse.json({
    ok: true,
    redirect: purpose === "leave_application" ? "/leave-application" : "/",
    locationAlert: purpose === "full" ? locationAlert || null : null,
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
