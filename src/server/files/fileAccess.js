import db from "@/server/db";

export function canViewAllFiles(role) {
  return role === "admin";
}

export const fileListIncludes = [
  {
    model: db.User,
    as: "owner",
    attributes: ["id", "username"],
  },
];

export async function getAccessibleFile(id, authedUser, { includeDeleted = false } = {}) {
  if (authedUser?.accessMode === "limited") {
    const limitedId = authedUser.afterShiftLimitedFileId;
    if (!limitedId || Number(id) !== Number(limitedId)) {
      return null;
    }
    return db.UserFile.findOne({
      where: { id: limitedId },
      attributes: ["id", "name", "content", "userId", "deleted", "createdAt", "updatedAt"],
      include: fileListIncludes,
    });
  }

  const where = { id };
  if (!canViewAllFiles(authedUser.role)) {
    where.userId = authedUser.id;
  }

  const query = {
    where,
    attributes: ["id", "name", "content", "userId", "deleted", "createdAt", "updatedAt"],
    include: fileListIncludes,
  };

  const allowDeleted = includeDeleted || canViewAllFiles(authedUser.role);
  if (allowDeleted) {
    return db.UserFile.unscoped().findOne(query);
  }

  return db.UserFile.findOne(query);
}

export function canCreateFiles(authedUser) {
  return authedUser?.accessMode !== "limited";
}

export function canWriteFile(authedUser, fileId) {
  if (authedUser?.accessMode !== "limited") return true;
  const limitedId = authedUser.afterShiftLimitedFileId;
  return Boolean(limitedId && Number(fileId) === Number(limitedId));
}
