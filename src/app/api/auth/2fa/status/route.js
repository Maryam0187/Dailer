import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canManageTotp } from "@/server/auth/totp";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageTotp(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await db.User.findByPk(authedUser.id, {
    attributes: ["id", "totpEnabled", "totpEnabledAt"],
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    totpEnabled: user.totpEnabled === true,
    totpEnabledAt: user.totpEnabledAt,
  });
}
