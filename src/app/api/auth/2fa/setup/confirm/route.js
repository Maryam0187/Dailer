import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canManageTotp, decryptSecret, verifyTotpCode } from "@/server/auth/totp";
import { logUserActivity } from "@/server/activity/logUserActivity";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageTotp(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (authedUser.sessionPurpose !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const code = body?.code;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const user = await db.User.findByPk(authedUser.id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is already enabled" }, { status: 400 });
  }

  if (!user.totpSecretEncrypted) {
    return NextResponse.json({ error: "Start setup before confirming" }, { status: 400 });
  }

  let secretBase32;
  try {
    secretBase32 = decryptSecret(user.totpSecretEncrypted);
  } catch {
    return NextResponse.json({ error: "Invalid setup state" }, { status: 500 });
  }

  if (!secretBase32 || !verifyTotpCode(secretBase32, code)) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "2fa_setup_failed",
      metadata: { username: user.username, reason: "invalid_code" },
    });
    return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
  }

  const totpEnabledAt = new Date();
  await user.update({
    totpEnabled: true,
    totpEnabledAt,
  });

  await logUserActivity({
    req,
    userId: user.id,
    action: "2fa_enabled",
    metadata: { username: user.username },
  });

  return NextResponse.json({
    ok: true,
    totpEnabled: true,
    totpEnabledAt,
  });
}
