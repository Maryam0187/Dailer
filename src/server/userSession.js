import db from "@/server/db";

/**
 * One active Dialer session per user. Tabs heartbeat to keep the lock; stale locks
 * (no heartbeat within {@link SESSION_STALE_MS}) are claimable by another tab/device.
 *
 * Implementation note: we do not rely on Sequelize's `affected` count from UPDATE.
 * MySQL's default returns *changed* rows, not *matched* rows — so an UPDATE that
 * sets the same values back returns 0, which would falsely look like "didn't match".
 * Instead we SELECT the row first and decide explicitly.
 */
export const SESSION_STALE_MS = 15_000;

function isValidSessionId(s) {
  return typeof s === "string" && s.length > 0 && s.length <= 64;
}

async function readSession(userId) {
  return db.User.findOne({
    where: { id: userId },
    attributes: ["id", "activeSessionId", "activeSessionLastSeenAt"],
  });
}

/**
 * Atomically claim or refresh the active session for {@link userId}. Used at
 * initial registration ({@code /api/twilio/token}).
 *
 * @param {number} userId
 * @param {string} sessionId
 * @returns {Promise<{ ok: true } | { ok: false, reason: "invalid" | "locked_elsewhere" }>}
 */
export async function acquireOrRefreshSession(userId, sessionId) {
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, reason: "invalid" };
  if (!isValidSessionId(sessionId)) return { ok: false, reason: "invalid" };

  const row = await readSession(userId);
  if (!row) return { ok: false, reason: "invalid" };

  const now = new Date();
  const lastSeen = row.activeSessionLastSeenAt ? new Date(row.activeSessionLastSeenAt) : null;
  const isOwner = row.activeSessionId === sessionId;
  const isFree = row.activeSessionId == null;
  const isStale = !lastSeen || now.getTime() - lastSeen.getTime() >= SESSION_STALE_MS;

  if (!isOwner && !isFree && !isStale) {
    return { ok: false, reason: "locked_elsewhere" };
  }

  await db.User.update(
    { activeSessionId: sessionId, activeSessionLastSeenAt: now },
    { where: { id: userId } },
  );
  return { ok: true };
}

/**
 * Heartbeat: refresh {@code activeSessionLastSeenAt} only if this tab still owns
 * the lock. Never claims/creates a lock — prevents races where a ping landing
 * after logout's release could re-acquire a row the user no longer wants.
 *
 * @param {number} userId
 * @param {string} sessionId
 * @returns {Promise<{ ok: true } | { ok: false, reason: "invalid" | "not_owner" }>}
 */
export async function refreshSessionIfOwner(userId, sessionId) {
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, reason: "invalid" };
  if (!isValidSessionId(sessionId)) return { ok: false, reason: "invalid" };

  const row = await readSession(userId);
  if (!row || row.activeSessionId !== sessionId) {
    return { ok: false, reason: "not_owner" };
  }

  await db.User.update(
    { activeSessionLastSeenAt: new Date() },
    { where: { id: userId, activeSessionId: sessionId } },
  );
  return { ok: true };
}

/**
 * Clear the lock if and only if it still belongs to this sessionId.
 *
 * @param {number} userId
 * @param {string} sessionId
 */
export async function releaseSession(userId, sessionId) {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!isValidSessionId(sessionId)) return;

  await db.User.update(
    { activeSessionId: null, activeSessionLastSeenAt: null },
    { where: { id: userId, activeSessionId: sessionId } },
  );
}
