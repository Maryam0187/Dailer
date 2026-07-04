import { Op } from "sequelize";
import db from "@/server/db";

export function canViewAllFiles(role) {
  return role === "admin";
}

export const fileEditAccessInclude = {
  model: db.UserFileEditAccess,
  as: "editAccessGrants",
  attributes: ["id", "userId"],
  separate: true,
  include: [
    {
      model: db.User,
      as: "user",
      attributes: ["id", "username"],
    },
  ],
};

export const fileListIncludes = [
  {
    model: db.User,
    as: "owner",
    attributes: ["id", "username"],
  },
  fileEditAccessInclude,
];

const fileAttributes = ["id", "name", "content", "userId", "deleted", "sharedWithAll", "createdAt", "updatedAt"];

export async function getEditAccessFileIdsForUser(userId) {
  const grants = await db.UserFileEditAccess.findAll({
    where: { userId },
    attributes: ["fileId"],
    raw: true,
  });
  return grants.map((grant) => grant.fileId);
}

export function nonAdminFileAccessWhere(userId, editAccessFileIds = []) {
  const orConditions = [{ userId }, { sharedWithAll: true }];
  if (editAccessFileIds.length > 0) {
    orConditions.push({ id: { [Op.in]: editAccessFileIds } });
  }
  return { [Op.or]: orConditions };
}

export function ownFilesWhere(userId) {
  return { userId };
}

export function sharedFilesWhere(userId, { isAdmin = false, editAccessFileIds = [] } = {}) {
  if (isAdmin) {
    return {
      [Op.or]: [
        { sharedWithAll: true },
        db.sequelize.literal(
          "EXISTS (SELECT 1 FROM UserFileEditAccess AS ea WHERE ea.fileId = UserFile.id)",
        ),
      ],
    };
  }

  const orConditions = [{ sharedWithAll: true, userId: { [Op.ne]: userId } }];
  if (editAccessFileIds.length > 0) {
    orConditions.push({ id: { [Op.in]: editAccessFileIds }, userId: { [Op.ne]: userId } });
  }
  return { [Op.or]: orConditions };
}

export function hasEditGrant(file, userId) {
  if (!file?.editAccessGrants?.length || userId == null) return false;
  return file.editAccessGrants.some((grant) => grant.userId === userId);
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
    const editAccessFileIds = await getEditAccessFileIdsForUser(authedUser.id);
    Object.assign(where, nonAdminFileAccessWhere(authedUser.id, editAccessFileIds));
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
  if (file.userId === authedUser.id) return true;
  return hasEditGrant(file, authedUser.id);
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
  if (hasEditGrant(file, authedUser.id)) return false;
  if (canViewAllFiles(authedUser.role)) return false;
  return Boolean(file.sharedWithAll);
}

export function canManageFileSharing(authedUser) {
  return canViewAllFiles(authedUser?.role);
}

export function canToggleSharedWithAll(authedUser) {
  return canManageFileSharing(authedUser);
}
