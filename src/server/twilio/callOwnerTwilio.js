import db from "@/server/db";
import { getTeamTwilioContext, resolveFromNumberLine1, resolveFromNumberLine2 } from "@/server/twilioTeam";

const USER_TWILIO_ATTRS = [
  "id",
  "username",
  "role",
  "managerId",
  "twilioFromNumber",
  "twilioFromNumberLine2",
  "canUseDialer2",
];

/**
 * Load user fields needed for team Twilio context + From resolution.
 * @param {number|string} userId
 */
export async function loadUserForTwilio(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;
  return db.User.findByPk(id, { attributes: USER_TWILIO_ATTRS });
}

/**
 * Twilio client + context for a call owner (by user id).
 */
export async function getTwilioContextForUserId(userId) {
  const user = await loadUserForTwilio(userId);
  if (!user) {
    throw new Error("Call owner user not found");
  }
  const ctx = await getTeamTwilioContext(user);
  return { user, ctx, client: ctx.client };
}

/**
 * Merge sparse authedUser with DB fields for From / team resolution.
 */
export async function resolveDialUser(authedUser) {
  if (!authedUser?.id) return null;
  const row = await loadUserForTwilio(authedUser.id);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    managerId: row.managerId,
    twilioFromNumber: row.twilioFromNumber,
    twilioFromNumberLine2: row.twilioFromNumberLine2,
    canUseDialer2: row.canUseDialer2,
  };
}

export { resolveFromNumberLine1, resolveFromNumberLine2, getTeamTwilioContext };
