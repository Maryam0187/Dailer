import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthedUserWithLogoutReason } from "@/server/auth/getAuthedUser";

export const runtime = "nodejs";

/** Lightweight session check for client-side auth expiry handling. */
export async function GET() {
  const cookieStore = await cookies();
  const hadToken = Boolean(cookieStore.get("token")?.value);
  const { user, logoutReason } = await getAuthedUserWithLogoutReason();

  if (user) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({
    ok: false,
    hadToken,
    reason: logoutReason || null,
  });
}
