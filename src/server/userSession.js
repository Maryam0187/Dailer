import { Op } from "sequelize";
import db from "@/server/db";

/**
 * One active Dialer session per user. Tabs heartbeat to keep the lock; stale locks
 * (no heartbeat within STALE_MS) are claimable by another tab/device.
 */
export const SESSION_STALE_MS = 15_000;

function isValidSessionId(s) {
  return typeof s === "string" && s.length > 0 && s.length <= 64;
}

/**
 * Atomically claim or refresh the active session row for {@link userId}.
 *
 * @param {number} userId
 * @param {string} sessionId
 * @returns {Promise<{ ok: true } | { ok: false, reason: "invalid" | "locked_elsewhere" }>}
 */
export async function acquireOrRefreshSession(userId, sessionId) {
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, reason: "invalid" };
  if (!isValidSessionId(sessionId)) return { ok: false, reason: "invalid" };

  const staleCutoff = new Date(Date.now() - SESSION_STALE_MS);
  const [affected] = await db.User.update(
    { activeSessionId: sessionId, activeSessionLastSeenAt: new Date() },
    {
      where: {
        id: userId,
        [Op.or]: [
          { activeSessionId: null },
          { activeSessionId: sessionId },
          { activeSessionLastSeenAt: { [Op.lt]: staleCutoff } },
          { activeSessionLastSeenAt: null },
        ],
      },
    },
  );

  return affected > 0 ? { ok: true } : { ok: false, reason: "locked_elsewhere" };
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
