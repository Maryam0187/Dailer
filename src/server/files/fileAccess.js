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

export async function getAccessibleFile(id, authedUser) {
  if (authedUser?.accessMode === "limited") {
    const limitedId = authedUser.afterShiftLimitedFileId;
    if (!limitedId || Number(id) !== Number(limitedId)) {
      return null;
    }
    return db.UserFile.findOne({
      where: { id: limitedId },
      attributes: ["id", "name", "content", "userId", "createdAt", "updatedAt"],
      include: fileListIncludes,
    });
  }

  const where = { id };
  if (!canViewAllFiles(authedUser.role)) {
    where.userId = authedUser.id;
  }

  return db.UserFile.findOne({
    where,
    attributes: ["id", "name", "content", "userId", "createdAt", "updatedAt"],
    include: fileListIncludes,
  });
}

export function canCreateFiles(authedUser) {
  return authedUser?.accessMode !== "limited";
}

export function canWriteFile(authedUser, fileId) {
  if (authedUser?.accessMode !== "limited") return true;
  const limitedId = authedUser.afterShiftLimitedFileId;
  return Boolean(limitedId && Number(fileId) === Number(limitedId));
}
