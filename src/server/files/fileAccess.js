import { Op } from "sequelize";
import db from "@/server/db";

export function canViewAllFiles(role) {
  return role === "admin";
}

function fileUserListInclude(model, as) {
  return {
    model,
    as,
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
}

export const fileEditAccessInclude = fileUserListInclude(db.UserFileEditAccess, "editAccessGrants");
export const fileViewAccessInclude = fileUserListInclude(db.UserFileViewAccess, "viewAccessGrants");
export const fileHiddenFromInclude = fileUserListInclude(db.UserFileHiddenFrom, "hiddenFrom");

export const fileAttachmentInclude = {
  model: db.UserFileAttachment,
  as: "attachments",
  attributes: ["id", "fileId", "originalName", "mimeType", "sizeBytes", "status", "createdAt"],
  required: false,
  separate: true,
  where: { status: "attached" },
};

export const fileListIncludes = [
  {
    model: db.User,
    as: "owner",
    attributes: ["id", "username"],
  },
  fileEditAccessInclude,
  fileViewAccessInclude,
  fileHiddenFromInclude,
  fileAttachmentInclude,
];

const fileAttributes = ["id", "name", "content", "userId", "deleted", "sharedWithAll", "createdAt", "updatedAt"];

async function getFileIdsForUser(model, userId) {
  const rows = await model.findAll({
    where: { userId },
    attributes: ["fileId"],
    raw: true,
  });
  return rows.map((row) => row.fileId);
}

export async function getEditAccessFileIdsForUser(userId) {
  return getFileIdsForUser(db.UserFileEditAccess, userId);
}

export async function getFileShareIdsForUser(userId) {
  const [editAccessFileIds, viewAccessFileIds, hiddenFileIds] = await Promise.all([
    getFileIdsForUser(db.UserFileEditAccess, userId),
    getFileIdsForUser(db.UserFileViewAccess, userId),
    getFileIdsForUser(db.UserFileHiddenFrom, userId),
  ]);
  return { editAccessFileIds, viewAccessFileIds, hiddenFileIds };
}

function sharedWithAllCondition({ userId = null, hiddenFileIds = [] } = {}) {
  const condition = { sharedWithAll: true };
  if (userId != null) {
    condition.userId = { [Op.ne]: userId };
  }
  if (hiddenFileIds.length > 0) {
    condition.id = { [Op.notIn]: hiddenFileIds };
  }
  return condition;
}

export function nonAdminFileAccessWhere(userId, {
  editAccessFileIds = [],
  viewAccessFileIds = [],
  hiddenFileIds = [],
} = {}) {
  const orConditions = [{ userId }, sharedWithAllCondition({ hiddenFileIds })];
  if (editAccessFileIds.length > 0) {
    orConditions.push({ id: { [Op.in]: editAccessFileIds } });
  }
  if (viewAccessFileIds.length > 0) {
    orConditions.push({ id: { [Op.in]: viewAccessFileIds } });
  }
  return { [Op.or]: orConditions };
}

export function ownFilesWhere(userId) {
  return { userId };
}

export function sharedFilesWhere(userId, {
  isAdmin = false,
  editAccessFileIds = [],
  viewAccessFileIds = [],
  hiddenFileIds = [],
} = {}) {
  if (isAdmin) {
    return {
      [Op.or]: [
        { sharedWithAll: true },
        db.sequelize.literal(
          "EXISTS (SELECT 1 FROM UserFileEditAccess AS ea WHERE ea.fileId = UserFile.id)",
        ),
        db.sequelize.literal(
          "EXISTS (SELECT 1 FROM UserFileViewAccess AS va WHERE va.fileId = UserFile.id)",
        ),
      ],
    };
  }

  const orConditions = [sharedWithAllCondition({ userId, hiddenFileIds })];
  if (editAccessFileIds.length > 0) {
    orConditions.push({ id: { [Op.in]: editAccessFileIds }, userId: { [Op.ne]: userId } });
  }
  if (viewAccessFileIds.length > 0) {
    orConditions.push({ id: { [Op.in]: viewAccessFileIds }, userId: { [Op.ne]: userId } });
  }
  return { [Op.or]: orConditions };
}

function hasGrant(grants, userId) {
  if (!grants?.length || userId == null) return false;
  return grants.some((grant) => grant.userId === userId);
}

export function hasEditGrant(file, userId) {
  return hasGrant(file?.editAccessGrants, userId);
}

export function hasViewGrant(file, userId) {
  return hasGrant(file?.viewAccessGrants, userId);
}

export function isHiddenFromUser(file, userId) {
  return hasGrant(file?.hiddenFrom, userId);
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
    const shareIds = await getFileShareIdsForUser(authedUser.id);
    Object.assign(where, nonAdminFileAccessWhere(authedUser.id, shareIds));
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
  return Boolean(file.sharedWithAll) || hasViewGrant(file, authedUser.id);
}

export function canManageFileSharing(authedUser) {
  return canViewAllFiles(authedUser?.role);
}

export function canToggleSharedWithAll(authedUser) {
  return canManageFileSharing(authedUser);
}

/** Admin, or a user the admin granted access to. File ownership is not enough. */
export function canManageFileImages(authedUser, file) {
  if (!file || file.deleted) return false;
  if (authedUser?.accessMode === "limited") return false;
  if (canViewAllFiles(authedUser?.role)) return true;
  return hasEditGrant(file, authedUser?.id);
}
