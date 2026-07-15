import { NextResponse } from "next/server";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { getTotpPendingUser } from "@/server/auth/getTotpPendingUser";
import { issueFullSessionResponse } from "@/server/auth/issueSession";
import { decryptSecret, verifyTotpCode } from "@/server/auth/totp";

export async function POST(req) {
  const pending = await getTotpPendingUser();
  if (!pending) {
    return NextResponse.json({ error: "Two-factor verification required. Sign in again." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const code = body?.code;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const { user, sid, sessionDay, pendingPurpose } = pending;

  let secretBase32;
  try {
    secretBase32 = decryptSecret(user.totpSecretEncrypted);
  } catch {
    return NextResponse.json({ error: "Two-factor setup is invalid. Ask an admin to reset it." }, { status: 500 });
  }

  if (!secretBase32 || !verifyTotpCode(secretBase32, code)) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "2fa_failed",
      sessionId: sid,
      metadata: { username: user.username, reason: "invalid_code" },
    });
    return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
  }

  await logUserActivity({
    req,
    userId: user.id,
    action: "2fa_success",
    sessionId: sid,
    metadata: { username: user.username },
  });

  await user.update({ activeSessionLastSeenAt: new Date() });

  return issueFullSessionResponse({
    req,
    user,
    sid,
    sessionDay,
    loginPurpose: pendingPurpose,
  });
}
