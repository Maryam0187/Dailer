import { Op } from "sequelize";
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

const fileAttributes = ["id", "name", "content", "userId", "deleted", "sharedWithAll", "createdAt", "updatedAt"];

export function nonAdminFileAccessWhere(userId) {
  return {
    [Op.or]: [{ userId }, { sharedWithAll: true }],
  };
}

export function ownFilesWhere(userId) {
  return { userId };
}

export function sharedFilesWhere(userId, { isAdmin = false } = {}) {
  if (isAdmin) {
    return { sharedWithAll: true };
  }
  return {
    sharedWithAll: true,
    userId: { [Op.ne]: userId },
  };
}

export async function getAccessibleFile(id, authedUser, { includeDeleted = false } = {}) {
  if (authedUser?.accessMode === "limited") {
    const limitedId = authedUser.afterShiftLimitedFileId;
    if (!limitedId || Number(id) !== Number(limitedId)) {
      return null;
    }
    return db.UserFile.findOne({
      where: { id: limitedId },
      attributes: fileAttributes,
      include: fileListIncludes,
    });
  }

  const where = { id };
  if (!canViewAllFiles(authedUser.role)) {
    Object.assign(where, nonAdminFileAccessWhere(authedUser.id));
  }

  const query = {
    where,
    attributes: fileAttributes,
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

export function canEditFile(authedUser, file) {
  if (!file || file.deleted) return false;
  if (authedUser?.accessMode === "limited") {
    const limitedId = authedUser.afterShiftLimitedFileId;
    return Boolean(limitedId && Number(file.id) === Number(limitedId));
  }
  if (canViewAllFiles(authedUser.role)) return true;
  return file.userId === authedUser.id;
}

export function canWriteFile(authedUser, fileId) {
  if (authedUser?.accessMode !== "limited") return true;
  const limitedId = authedUser.afterShiftLimitedFileId;
  return Boolean(limitedId && Number(fileId) === Number(limitedId));
}

export function canDeleteFile(authedUser, file) {
  if (!file || file.deleted) return false;
  if (!canCreateFiles(authedUser)) return false;
  if (canViewAllFiles(authedUser.role)) return true;
  return file.userId === authedUser.id;
}

export function canCopyFile(authedUser, file) {
  if (!file || file.deleted) return false;
  if (!canCreateFiles(authedUser)) return false;
  if (file.userId === authedUser.id) return false;
  return Boolean(file.sharedWithAll);
}

export function canToggleSharedWithAll(authedUser) {
  return canViewAllFiles(authedUser?.role);
}
