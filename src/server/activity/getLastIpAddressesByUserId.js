import { QueryTypes } from "sequelize";
import db from "@/server/db";

/**
 * Returns a Map of userId -> most recent non-null ipAddress from UserActivities.
 */
export async function getLastIpAddressesByUserId(userIds) {
  const ids = [...new Set(userIds.filter((id) => id != null))];
  if (ids.length === 0) return new Map();

  const rows = await db.sequelize.query(
    `SELECT ua.userId, ua.ipAddress
     FROM UserActivities ua
     INNER JOIN (
       SELECT userId, MAX(id) AS maxId
       FROM UserActivities
       WHERE userId IN (:userIds) AND ipAddress IS NOT NULL
       GROUP BY userId
     ) latest ON ua.id = latest.maxId`,
    {
      replacements: { userIds: ids },
      type: QueryTypes.SELECT,
    },
  );

  return new Map(rows.map((row) => [row.userId, row.ipAddress]));
}
