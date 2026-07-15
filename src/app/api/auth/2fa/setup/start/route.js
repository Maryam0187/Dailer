import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  buildEnrollmentPayload,
  canManageTotp,
  encryptSecret,
  generateTotpSecret,
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

  const user = await db.User.findByPk(authedUser.id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is already enabled. Disable it first to set up again." },
      { status: 400 },
    );
  }

  const secret = generateTotpSecret();
  await user.update({
    totpSecretEncrypted: encryptSecret(secret),
    totpEnabled: false,
    totpEnabledAt: null,
  });

  await logUserActivity({
    req,
    userId: user.id,
    action: "2fa_setup_started",
    metadata: { username: user.username },
  });

  const enrollment = await buildEnrollmentPayload({
    secret,
    username: user.username,
  });

  return NextResponse.json({
    ok: true,
    qrDataUrl: enrollment.qrDataUrl,
    manualKey: enrollment.manualKey,
  });
}
