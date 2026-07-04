import { canCopyFile, canEditFile, hasEditGrant } from "@/server/files/fileAccess";

function serializeEditAccessUsers(file) {
  if (!file?.editAccessGrants?.length) return [];
  return file.editAccessGrants
    .filter((grant) => grant.user)
    .map((grant) => ({
      id: grant.user.id,
      username: grant.user.username,
    }));
}

export function serializeUserFile(file, { includeDeleted = false, viewer = null } = {}) {
  const editAccessUsers = serializeEditAccessUsers(file);
  const data = {
    id: file.id,
    name: file.name,
    content: file.content || "",
    sharedWithAll: Boolean(file.sharedWithAll),
    editAccessUsers,
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
    data.readOnly = !canEditFile(viewer, file);
    data.canCopy = canCopyFile(viewer, file);
    data.isSharedWithViewer =
      !data.isOwner && (Boolean(file.sharedWithAll) || data.hasEditAccess);
  }

  return data;
}
