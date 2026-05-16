import { isUserOnline } from "@/server/socketHub";

// Presence is driven by socket.io connection state (real-time):
//   online  – the user has at least one open socket (any tab/device)
//   away    – no open socket right now, but their last activity is recent
//   offline – logged out, OR never seen, OR no socket for a long time
//
// `activeSessionLastSeenAt` is bumped both by `getAuthedUser()` on every
// authenticated request and by socket connect/disconnect events, so the
// away → offline timing reflects when the user really left.

export const AWAY_GRACE_MS = 5 * 60 * 1000;

export function derivePresence(user, now = Date.now()) {
  const userId = user?.id ?? null;
  const sessionId = user?.activeSessionId;
  const lastSeenRaw = user?.activeSessionLastSeenAt ?? null;
  const lastSeenMs = lastSeenRaw ? new Date(lastSeenRaw).getTime() : null;

  if (!sessionId) {
    return { status: "offline", lastActiveAt: lastSeenRaw };
  }

  if (userId != null && isUserOnline(userId)) {
    return { status: "online", lastActiveAt: lastSeenRaw };
  }

  if (lastSeenMs && now - lastSeenMs <= AWAY_GRACE_MS) {
    return { status: "away", lastActiveAt: lastSeenRaw };
  }

  return { status: "offline", lastActiveAt: lastSeenRaw };
}
