import { canEditFile, canCopyFile } from "@/server/files/fileAccess";

export function serializeUserFile(file, { includeDeleted = false, viewer = null } = {}) {
  const data = {
    id: file.id,
    name: file.name,
    content: file.content || "",
    sharedWithAll: Boolean(file.sharedWithAll),
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
    data.readOnly = !canEditFile(viewer, file);
    data.canCopy = canCopyFile(viewer, file);
  }

  return data;
}
