import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import db from "@/server/db";

export async function getAuthedUser() {
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

  const userId = payload?.sub;
  if (!userId) return null;

  const user = await db.User.findByPk(userId);
  if (!user || user.isActive === false) return null;

  // Single-session enforcement: this cookie's sid must still be the user's
  // current active session. A newer login on another device/browser rotates
  // the sid server-side, so any older cookie holding the previous sid is
  // treated as unauthenticated. The `payload.sid &&` guard keeps legacy JWTs
  // (issued before this column existed) valid until they expire naturally.
  if (payload.sid && user.activeSessionId !== payload.sid) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    managerId: user.managerId,
  };
}


