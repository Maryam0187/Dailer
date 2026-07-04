import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  canCreateFiles,
  canDeleteFile,
  canEditFile,
  canManageFileSharing,
  canViewAllFiles,
  canWriteFile,
  fileListIncludes,
  getAccessibleFile,
} from "@/server/files/fileAccess";
import { sanitizeFileContent, trimFileName } from "@/server/files/sanitizeFileContent";
import { resolveRestoreFileName } from "@/server/files/resolveRestoreFileName";
import { serializeUserFile } from "@/server/files/serializeUserFile";
import { syncFileEditAccess } from "@/server/files/syncFileEditAccess";

export async function GET(_req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const file = await getAccessibleFile(id, authedUser);
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  return NextResponse.json({
    file: serializeUserFile(file, { includeDeleted: canViewAllFiles(authedUser.role), viewer: authedUser }),
  });
}

export async function PATCH(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);

  if (body?.restore === true) {
    if (!canViewAllFiles(authedUser.role)) {
      return NextResponse.json({ error: "Only admins can restore deleted files" }, { status: 403 });
    }

    const file = await getAccessibleFile(id, authedUser, { includeDeleted: true });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
    if (!file.deleted) return NextResponse.json({ error: "File is not deleted" }, { status: 400 });

    const restoredName = await resolveRestoreFileName(file.userId, file.name);
    const renamed = restoredName !== file.name;

    await file.update({ deleted: false, name: restoredName });
    await file.reload({ include: fileListIncludes });
    return NextResponse.json({
      ok: true,
      renamed,
      file: serializeUserFile(file, { viewer: authedUser }),
    });
  }

  const file = await getAccessibleFile(id, authedUser);
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (file.deleted) {
    return NextResponse.json({ error: "Cannot edit a deleted file. Restore it first." }, { status: 403 });
  }

  const update = {};
  const ownerUserId = file.userId;
  const sharingSettingsOnly =
    (body?.sharedWithAll !== undefined || body?.editAccessUserIds !== undefined) &&
    body?.name == null &&
    body?.content === undefined;

  if (body?.sharedWithAll !== undefined) {
    if (!canManageFileSharing(authedUser)) {
      return NextResponse.json({ error: "Only admins can change file visibility" }, { status: 403 });
    }
    update.sharedWithAll = Boolean(body.sharedWithAll);
  }

  if (body?.editAccessUserIds !== undefined) {
    if (!canManageFileSharing(authedUser)) {
      return NextResponse.json({ error: "Only admins can change edit access" }, { status: 403 });
    }
    if (!Array.isArray(body.editAccessUserIds)) {
      return NextResponse.json({ error: "editAccessUserIds must be an array" }, { status: 400 });
    }
    await syncFileEditAccess(id, body.editAccessUserIds, authedUser.id, ownerUserId);
  }

  if (!sharingSettingsOnly && !canEditFile(authedUser, file)) {
    return NextResponse.json({ error: "This file is read-only for your account." }, { status: 403 });
  }

  if (!sharingSettingsOnly && !canWriteFile(authedUser, id)) {
    return NextResponse.json({ error: "You cannot edit this file with limited after-shift access." }, { status: 403 });
  }

  if (body?.name != null) {
    const name = trimFileName(body.name);
    if (!name) return NextResponse.json({ error: "File name is required" }, { status: 400 });
    if (name !== file.name) {
      const existing = await db.UserFile.findOne({
        where: { userId: ownerUserId, name },
        attributes: ["id"],
      });
      if (existing && existing.id !== file.id) {
        return NextResponse.json({ error: "A file with this name already exists" }, { status: 409 });
      }
      update.name = name;
    }
  }

  if (body?.content !== undefined) {
    update.content = sanitizeFileContent(body.content);
  }

  if (Object.keys(update).length === 0 && body?.editAccessUserIds === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (Object.keys(update).length > 0) {
    await file.update(update);
  }

  await file.reload({ include: fileListIncludes });
  return NextResponse.json({ ok: true, file: serializeUserFile(file, { viewer: authedUser }) });
}

export async function DELETE(_req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreateFiles(authedUser)) {
    return NextResponse.json({ error: "Deleting files is not available with limited after-shift access." }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const file = await getAccessibleFile(id, authedUser);
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (file.deleted) {
    return NextResponse.json({ error: "File is already deleted" }, { status: 400 });
  }
  if (!canDeleteFile(authedUser, file)) {
    return NextResponse.json({ error: "You cannot delete this file" }, { status: 403 });
  }

  await file.update({ deleted: true });
  await db.User.update(
    { afterShiftLimitedFileId: null },
    { where: { afterShiftLimitedFileId: id } },
  );
  return NextResponse.json({ ok: true });
}
