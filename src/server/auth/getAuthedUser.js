import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import db from "@/server/db";
import { isLoginAllowedForRole } from "@/server/auth/loginWindow";

/**
 * Debounce window for updating `activeSessionLastSeenAt`. Every authenticated
 * request bumps the timestamp, but we skip the write when the existing value
 * is younger than this window so we don't hammer the DB on bursty traffic
 * (heartbeat-style page loads, polling components, etc.).
 */
const LAST_SEEN_REFRESH_MS = 30 * 1000;

async function resolveAuthedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { user: null, logoutReason: null };

  const secret = process.env.JWT_SECRET;
  if (!secret) return { user: null, logoutReason: null };

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return { user: null, logoutReason: null };
  }

  const userId = payload?.sub;
  if (!userId) return { user: null, logoutReason: null };

  const user = await db.User.findByPk(userId);
  if (!user || user.isActive === false) return { user: null, logoutReason: null };

  // Single-session enforcement: this cookie's sid must still be the user's
  // current active session. A newer login on another device/browser rotates
  // the sid server-side, so any older cookie holding the previous sid is
  // treated as unauthenticated. The `payload.sid &&` guard keeps legacy JWTs
  // (issued before this column existed) valid until they expire naturally.
  if (payload.sid && user.activeSessionId !== payload.sid) {
    return { user: null, logoutReason: null };
  }

  if (!isLoginAllowedForRole(user.role)) {
    try {
      await db.User.update(
        { activeSessionId: null, activeSessionLastSeenAt: null },
        { where: { id: user.id } },
      );
    } catch {
      /* non-fatal: session clear is best-effort */
    }
    return { user: null, logoutReason: "shift_ended" };
  }

  // Refresh presence on real authenticated activity — no synthetic heartbeat
  // needed. Debounced so a flurry of API calls only triggers one UPDATE.
  try {
    const lastSeen = user.activeSessionLastSeenAt
      ? new Date(user.activeSessionLastSeenAt).getTime()
      : 0;
    if (Date.now() - lastSeen > LAST_SEEN_REFRESH_MS) {
      await db.User.update(
        { activeSessionLastSeenAt: new Date() },
        { where: { id: user.id } },
      );
    }
  } catch {
    /* non-fatal: presence is best-effort and must not block auth */
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      managerId: user.managerId,
    },
    logoutReason: null,
  };
}

export async function getAuthedUser() {
  const { user } = await resolveAuthedUser();
  return user;
}

/** For server layouts that need to distinguish shift logout from other auth failures. */
export async function getAuthedUserWithLogoutReason() {
  return resolveAuthedUser();
}
