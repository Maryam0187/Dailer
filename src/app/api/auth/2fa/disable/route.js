import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  canManageTotp,
  clearTotpFields,
  decryptSecret,
  verifyTotpCode,
} from "@/server/auth/totp";
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
  const password = body?.password;
  const code = body?.code;

  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const user = await db.User.findByPk(authedUser.id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is not enabled" }, { status: 400 });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  let secretBase32;
  try {
    secretBase32 = decryptSecret(user.totpSecretEncrypted);
  } catch {
    return NextResponse.json({ error: "Invalid two-factor setup" }, { status: 500 });
  }

  if (!secretBase32 || !verifyTotpCode(secretBase32, code)) {
    await logUserActivity({
      req,
      userId: user.id,
      action: "2fa_disable_failed",
      metadata: { username: user.username, reason: "invalid_code" },
    });
    return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
  }

  await user.update(clearTotpFields());

  await logUserActivity({
    req,
    userId: user.id,
    action: "2fa_disabled",
    metadata: { username: user.username },
  });

  return NextResponse.json({ ok: true, totpEnabled: false });
}
