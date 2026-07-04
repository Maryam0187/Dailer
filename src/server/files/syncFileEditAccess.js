import db from "@/server/db";

export async function syncFileEditAccess(fileId, rawUserIds, grantedByUserId, ownerUserId) {
  const requestedIds = [...new Set(
    (Array.isArray(rawUserIds) ? rawUserIds : [])
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0 && id !== ownerUserId),
  )];

  if (requestedIds.length === 0) {
    await db.UserFileEditAccess.destroy({ where: { fileId } });
    return [];
  }

  const users = await db.User.findAll({
    where: { id: requestedIds },
    attributes: ["id"],
  });
  const validIds = users.map((user) => user.id);

  await db.UserFileEditAccess.destroy({ where: { fileId } });
  if (validIds.length > 0) {
    await db.UserFileEditAccess.bulkCreate(
      validIds.map((userId) => ({ fileId, userId, grantedByUserId })),
    );
  }

  return validIds;
}
