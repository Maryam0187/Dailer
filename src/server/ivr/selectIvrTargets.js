import db from "@/server/db";
import { userHasActiveCall } from "@/server/calls/userActiveCall";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";

function maxRingTargets() {
  const n = Number(process.env.IVR_MAX_RING_TARGETS);
  if (Number.isInteger(n) && n > 0) return Math.min(n, 20);
  return 5;
}

/**
 * Active admins to ring for IVR (online or offline).
 * Skips admins already on another call. First to answer wins via multi-Client Dial.
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
