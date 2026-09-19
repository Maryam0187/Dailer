import {
  canCopyFile,
  canEditFile,
  canManageFileImages,
  hasEditGrant,
  hasViewGrant,
  isHiddenFromUser,
} from "@/server/files/fileAccess";
import { serializeFileAttachments } from "@/server/files/fileAttachments";

function serializeGrantUsers(grants) {
  if (!grants?.length) return [];
  return grants
    .filter((grant) => grant.user)
    .map((grant) => ({
      id: grant.user.id,
      username: grant.user.username,
    }));
}

export function serializeUserFile(file, { includeDeleted = false, viewer = null } = {}) {
  const editAccessUsers = serializeGrantUsers(file.editAccessGrants);
  const viewAccessUsers = serializeGrantUsers(file.viewAccessGrants);
  const hiddenFromUsers = serializeGrantUsers(file.hiddenFrom);
  const data = {
    id: file.id,
    name: file.name,
    content: file.content || "",
    sharedWithAll: Boolean(file.sharedWithAll),
    preventCopy: Boolean(file.preventCopy),
    editAccessUsers,
    viewAccessUsers,
    hiddenFromUsers,
    attachments: serializeFileAttachments(file.attachments),
    createdAt: file.createdAt?.toISOString?.() ?? file.createdAt,
    updatedAt: file.updatedAt?.toISOString?.() ?? file.updatedAt,
  };

  if (file.deleted) {
    data.deleted = true;
  } else if (includeDeleted) {
    data.deleted = false;
  }

  if (file.owner) {
    data.owner = {
      id: file.owner.id,
      username: file.owner.username,
    };
  }

  if (viewer) {
    data.isOwner = file.userId === viewer.id;
    data.hasEditAccess = hasEditGrant(file, viewer.id);
    data.hasViewAccess = hasViewGrant(file, viewer.id);
    data.canManageImages = canManageFileImages(viewer, file);
    data.readOnly = !canEditFile(viewer, file);
    data.canCopy = canCopyFile(viewer, file);
    data.isSharedWithViewer =
      !data.isOwner &&
      (data.hasEditAccess ||
        data.hasViewAccess ||
        (Boolean(file.sharedWithAll) && !isHiddenFromUser(file, viewer.id)));
  }

  return data;
}
