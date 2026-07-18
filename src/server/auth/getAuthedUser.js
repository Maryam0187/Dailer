import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import db from "@/server/db";
import { resolveAccessMode } from "@/server/auth/accessMode";
import { isLoginAllowed, isSessionValidForToday } from "@/server/auth/loginWindow";
import { hasAfterShiftGrant } from "@/server/auth/loginWindow.core.cjs";
import { getShiftSettingsRecords } from "@/server/auth/shiftSettings";
import { isUserOnApprovedLeave } from "@/server/leave/userLeave";
import { userHasActiveCall } from "@/server/calls/userActiveCall";
import {
  hasStoredAfterShiftGrant,
  isAfterShiftGrantExpired,
} from "@/server/auth/afterShiftGrant.cjs";

/**
 * Debounce window for updating `activeSessionLastSeenAt`. Every authenticated
 * request bumps the timestamp, but we skip the write when the existing value
 * is younger than this window so we don't hammer the DB on bursty traffic
 * (heartbeat-style page loads, polling components, etc.).
 *
 * Presence "away/offline" uses this timestamp — it does NOT log the user out.
 */
const LAST_SEEN_REFRESH_MS = 30 * 1000;

async function clearUserSession(userId) {
  try {
    await db.User.update(
      { activeSessionId: null, activeSessionLastSeenAt: new Date() },
      { where: { id: userId } },
    );
  } catch {
    /* non-fatal: session clear is best-effort */
  }
}

async function revokeExpiredAfterShiftGrant(user) {
  if (!user || !hasStoredAfterShiftGrant(user) || !isAfterShiftGrantExpired(user)) {
    return user;
  }

  try {
    await db.User.update(
      {
        afterShiftAccess: "none",
        afterShiftLimitedFileId: null,
        afterShiftAccessExpiresAt: null,
      },
      { where: { id: user.id } },
    );
  } catch {
    return user;
  }

  user.afterShiftAccess = "none";
  user.afterShiftLimitedFileId = null;
  user.afterShiftAccessExpiresAt = null;
  return user;
}

async function resolveAuthedUser() {
  // Sync shift bounds from DB before login-window checks. The status API
  // already does this; using a stale boot-time cache here caused false shift_ended
  // logouts while /api/shift/status still reported the shift as active.
  const shiftRecords = await getShiftSettingsRecords();
  const shiftSettingsReliable =
    shiftRecords?.day?.loadOk !== false && shiftRecords?.night?.loadOk !== false;

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

  // Password OK but TOTP not verified yet — not a full app session.
  if (payload?.purpose === "totp_pending") {
    return { user: null, logoutReason: null };
  }

  let user = await db.User.findByPk(userId);
  if (!user || user.isActive === false) return { user: null, logoutReason: null };

  user = await revokeExpiredAfterShiftGrant(user);

  // True replacement: another login minted a new sid.
  if (payload.sid && user.activeSessionId && user.activeSessionId !== payload.sid) {
    return { user: null, logoutReason: "replaced" };
  }
  // Session was cleared earlier (shift/day/leave/logout) — not "signed in elsewhere".
  if (payload.sid && !user.activeSessionId) {
    return { user: null, logoutReason: "session_ended" };
  }

  if (!isSessionValidForToday(payload, new Date(), user)) {
    await clearUserSession(user.id);
    return { user: null, logoutReason: "session_day_ended" };
  }

  const sessionPurpose =
    payload?.purpose === "leave_application" ? "leave_application" : "full";

  if (sessionPurpose === "leave_application") {
    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        sessionPurpose: "leave_application",
      },
      logoutReason: null,
    };
  }

  let onApprovedLeave = false;
  try {
    onApprovedLeave = await isUserOnApprovedLeave(user.id);
  } catch (err) {
    // Fail open: a leave-table blip must not force sign-out mid-shift.
    console.error("[auth] leave check failed:", err?.message || err);
  }
  if (onApprovedLeave && user.role !== "admin" && !hasAfterShiftGrant(user)) {
    await clearUserSession(user.id);
    return { user: null, logoutReason: "user_on_leave" };
  }

  if (!isLoginAllowed(user)) {
    // Only force shift logout when settings were loaded successfully. A failed
    // reload used to fall back to env defaults and clear sessions mid-shift.
    if (!shiftSettingsReliable) {
      console.warn(
        "[auth] shift window denied login but settings reload failed; keeping session",
      );
    } else {
      let onActiveCall = false;
      try {
        onActiveCall = await userHasActiveCall(user.id);
      } catch (err) {
        console.error("[auth] active-call check failed:", err?.message || err);
      }
      if (!onActiveCall) {
        await clearUserSession(user.id);
        return { user: null, logoutReason: "shift_ended" };
      }
    }
  }

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

  const accessMode = resolveAccessMode(user);

  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      managerId: user.managerId,
      accessMode,
      afterShiftLimitedFileId: user.afterShiftLimitedFileId ?? null,
      shiftKey: user.shiftKey === "night" ? "night" : "day",
      sessionPurpose: "full",
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

export function signInRedirectPath(logoutReason = null) {
  if (logoutReason && logoutReason !== "shift_ended") {
    return `/sign-in?reason=${encodeURIComponent(logoutReason)}`;
  }
  return "/sign-in";
}
