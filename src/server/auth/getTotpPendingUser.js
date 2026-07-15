import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import db from "@/server/db";
import { isSessionValidForToday } from "@/server/auth/loginWindow";

/**
 * Resolve a password-verified admin waiting on the TOTP code step.
 * Returns null if the cookie is missing, invalid, or not totp_pending.
 */
export async function getTotpPendingUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return null;
  }

  if (payload?.purpose !== "totp_pending") return null;

  const userId = payload?.sub;
  if (!userId) return null;

  const user = await db.User.findByPk(userId);
  if (!user || user.isActive === false) return null;
  if (user.role !== "admin" || user.totpEnabled !== true) return null;

  if (payload.sid && user.activeSessionId !== payload.sid) return null;
  if (!isSessionValidForToday(payload)) return null;

  const pendingPurpose =
    payload.pendingPurpose === "leave_application" ? "leave_application" : "full";

  return {
    user,
    sid: payload.sid,
    sessionDay: payload.sessionDay,
    pendingPurpose,
  };
}
