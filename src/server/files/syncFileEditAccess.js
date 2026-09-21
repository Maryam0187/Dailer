import { Op } from "sequelize";
import db from "@/server/db";

function parseUserIds(rawUserIds, ownerUserId) {
  return [...new Set(
    (Array.isArray(rawUserIds) ? rawUserIds : [])
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0 && id !== ownerUserId),
  )];
}

async function validateUserIds(ids) {
  if (ids.length === 0) return [];
  const users = await db.User.findAll({
    where: { id: ids },
    attributes: ["id"],
  });
  return users.map((user) => user.id);
}

async function replaceFileUserRows({ model, fileId, userIds, actorUserId, actorField }) {
  await model.destroy({ where: { fileId } });
  if (userIds.length === 0) return;
  await model.bulkCreate(
    userIds.map((userId) => ({ fileId, userId, [actorField]: actorUserId })),
  );
}

async function removeFileUsersFromModel(model, fileId, userIds) {
  if (!userIds.length) return;
  await model.destroy({ where: { fileId, userId: { [Op.in]: userIds } } });
}

export async function syncFileShareLists(
  fileId,
  { editAccessUserIds, viewAccessUserIds, hiddenFromUserIds } = {},
  actorUserId,
  ownerUserId,
) {
  const lists = [];

  if (editAccessUserIds !== undefined) {
    lists.push({
      model: db.UserFileEditAccess,
      actorField: "grantedByUserId",
      raw: editAccessUserIds,
      others: [db.UserFileViewAccess, db.UserFileHiddenFrom],
    });
  }
  if (viewAccessUserIds !== undefined) {
    lists.push({
      model: db.UserFileViewAccess,
      actorField: "grantedByUserId",
      raw: viewAccessUserIds,
      others: [db.UserFileEditAccess, db.UserFileHiddenFrom],
    });
  }
  if (hiddenFromUserIds !== undefined) {
    lists.push({
      model: db.UserFileHiddenFrom,
      actorField: "hiddenByUserId",
      raw: hiddenFromUserIds,
      others: [db.UserFileEditAccess, db.UserFileViewAccess],
    });
  }

  for (const list of lists) {
    const validIds = await validateUserIds(parseUserIds(list.raw, ownerUserId));
    await replaceFileUserRows({
      model: list.model,
      fileId,
      userIds: validIds,
      actorUserId,
      actorField: list.actorField,
    });
    await Promise.all(list.others.map((model) => removeFileUsersFromModel(model, fileId, validIds)));
  }
}

export async function syncFileEditAccess(fileId, rawUserIds, grantedByUserId, ownerUserId) {
  await syncFileShareLists(fileId, { editAccessUserIds: rawUserIds }, grantedByUserId, ownerUserId);
}
