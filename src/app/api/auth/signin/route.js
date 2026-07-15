import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { logUserActivity } from "@/server/activity/logUserActivity";
import {
  isLoginAllowed,
  loginWindowErrorMessage,
  isLeaveDay,
  isManuallyActive,
} from "@/server/auth/loginWindow";
import { hasAfterShiftGrant } from "@/server/auth/loginWindow.core.cjs";
import { getShiftSettingsRecord } from "@/server/auth/shiftSettings";
import { isUserOnApprovedLeave } from "@/server/leave/userLeave";
import { isTotpRequiredAtLogin } from "@/server/auth/totp";
import {
  beginUserSession,
  issueFullSessionResponse,
  issueTotpPendingResponse,
} from "@/server/auth/issueSession";

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

  if (!process.env.JWT_SECRET) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  const { sid, sessionDay } = await beginUserSession(user);

  if (isTotpRequiredAtLogin(user)) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "login_2fa_required",
      sessionId: sid,
      metadata: { username: user.username, sessionDay, purpose },
    });
    return issueTotpPendingResponse({
      user,
      sid,
      sessionDay,
      loginPurpose: purpose,
    });
  }

  return issueFullSessionResponse({
    req,
    user,
    sid,
    sessionDay,
    loginPurpose: purpose,
  });
}
