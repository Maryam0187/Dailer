import db from "@/server/db";
import { isUserOnline } from "@/server/socketHub";
import { userHasActiveCall } from "@/server/calls/userActiveCall";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";

function maxRingTargets() {
  const n = Number(process.env.IVR_MAX_RING_TARGETS);
  if (Number.isInteger(n) && n > 0) return Math.min(n, 20);
  return 5;
}

/**
 * Active admins who are online in the dialer and not already on a call.
 * @returns {Promise<Array<{ userId: number, username: string, identity: string }>>}
 */
export async function selectIvrTargets() {
  const admins = await db.User.findAll({
    where: { role: "admin", isActive: true },
    attributes: ["id", "username"],
    order: [["id", "ASC"]],
  });

  const cap = maxRingTargets();
  const targets = [];

  for (const admin of admins) {
    if (targets.length >= cap) break;
    if (!isUserOnline(admin.id)) continue;
    try {
      if (await userHasActiveCall(admin.id)) continue;
    } catch {
      continue;
    }
    try {
      const identity = getAgentClientIdentity(admin.id, admin.username);
      targets.push({
        userId: admin.id,
        username: admin.username,
        identity,
      });
    } catch {
      /* skip invalid identity */
    }
  }

  return targets;
}
