import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { getSessionCalendarDate, isOutsideManager } from "@/server/auth/loginWindow";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { resolveDeviceTypeFromRequest, isDesktopAttendanceLogin } from "@/server/activity/resolveDeviceType";
import { processLoginGamification } from "@/server/attendance/processLoginGamification";
import { upsertDailyLoginRecord } from "@/server/attendance/upsertDailyLoginRecord";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  };
}

export async function beginUserSession(user) {
  const sid = crypto.randomUUID();
  const sessionDay = getSessionCalendarDate(new Date(), user);
  await user.update({ activeSessionId: sid, activeSessionLastSeenAt: new Date() });
  return { sid, sessionDay };
}

/**
 * Issue a short-lived pending cookie after password OK when TOTP is required.
 * Does not log login_success until /api/auth/2fa/verify completes.
 */
export function issueTotpPendingResponse({ user, sid, sessionDay, loginPurpose, body = {} }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      sid,
      sessionDay,
      purpose: "totp_pending",
      pendingPurpose: loginPurpose === "leave_application" ? "leave_application" : "full",
    },
    secret,
    { expiresIn: "10m" },
  );

  const res = NextResponse.json({
    ok: true,
    requires2fa: true,
    ...body,
  });
  res.cookies.set("token", token, authCookieOptions());
  return res;
}

export async function issueFullSessionResponse({
  req,
  user,
  sid,
  sessionDay,
  loginPurpose,
  body = {},
}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  const purpose = loginPurpose === "leave_application" ? "leave_application" : "full";
  const device = resolveDeviceTypeFromRequest(req);

  const { locationAlert } = await logUserActivity({
    req,
    userId: user.id,
    action: purpose === "leave_application" ? "leave_application_login" : "login_success",
    sessionId: sid,
    metadata: {
      username: user.username,
      sessionDay,
      purpose,
      deviceType: device.deviceType,
      attendanceTracked: purpose === "full" && isDesktopAttendanceLogin(device),
    },
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

  const token = jwt.sign(tokenPayload, secret, { expiresIn: "7d" });

  const homeRedirect =
    purpose === "leave_application"
      ? "/leave-application"
      : isOutsideManager(user)
        ? "/customers"
        : "/";

  if (purpose === "full" && isDesktopAttendanceLogin(device)) {
    try {
      const loginAt = new Date();
      await upsertDailyLoginRecord(user, loginAt, device);
      await processLoginGamification(user, loginAt);
    } catch (err) {
      console.error("[attendance] login tracking failed:", err?.message || err);
    }
  }

  const res = NextResponse.json({
    ok: true,
    redirect: homeRedirect,
    locationAlert: purpose === "full" ? locationAlert || null : null,
    ...body,
  });
  res.cookies.set("token", token, authCookieOptions());
  return res;
}
