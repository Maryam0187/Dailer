import { Op } from "sequelize";
import db from "@/server/db";

const ACTIVE_CALL_STATUSES = ["queued", "ringing", "in-progress", "initiated", "answered"];

export async function userHasActiveCall(userId) {
  if (!userId) return false;

  const owned = await db.CallLog.findOne({
    where: {
      userId,
      status: { [Op.in]: ACTIVE_CALL_STATUSES },
    },
    attributes: ["id"],
  });
  if (owned) return true;

  const invited = await db.InviteDialLeg.findOne({
    where: { invitedUserId: userId },
    attributes: ["callLogId"],
    include: [
      {
        model: db.CallLog,
        required: true,
        attributes: ["id"],
        where: {
          status: { [Op.in]: ACTIVE_CALL_STATUSES },
        },
      },
    ],
  });

  return Boolean(invited);
}
