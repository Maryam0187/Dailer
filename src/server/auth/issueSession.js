import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { getSessionCalendarDate } from "@/server/auth/loginWindow";
import { logUserActivity } from "@/server/activity/logUserActivity";

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
  const sessionDay = getSessionCalendarDate();
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

  const token = jwt.sign(tokenPayload, secret, { expiresIn: "7d" });

  const res = NextResponse.json({
    ok: true,
    redirect: purpose === "leave_application" ? "/leave-application" : "/",
    locationAlert: purpose === "full" ? locationAlert || null : null,
    ...body,
  });
  res.cookies.set("token", token, authCookieOptions());
  return res;
}
