import db from "@/server/db";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/server/messages/attachmentConfig";
import {
  createDownloadTarget,
  createUploadTarget,
  deleteStoredAttachment,
  headStoredAttachment,
  isAttachmentStorageAvailable,
  readStoredAttachment,
  writeStoredAttachment,
} from "@/server/messages/attachmentStorage";
import {
  buildFileAttachmentStorageKey,
  sanitizeAttachmentFilename,
} from "@/server/messages/objectStorage";

export const FILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_IMAGES_PER_FILE = 5;

const MIME_TO_ACCEPT = {
  "image/jpeg": ".jpg,.jpeg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const allowedMimeTypes = new Set(FILE_IMAGE_MIME_TYPES);

export function getFileImageUploadConfig() {
  const accept = FILE_IMAGE_MIME_TYPES.flatMap((mimeType) =>
    String(MIME_TO_ACCEPT[mimeType] || "")
      .split(",")
      .filter(Boolean),
  );
  return {
    mimeTypes: [...FILE_IMAGE_MIME_TYPES],
    accept: [...new Set(accept)].join(","),
    maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
    maxAttachmentsPerFile: MAX_IMAGES_PER_FILE,
  };
}

export function serializeFileAttachment(attachment) {
  const plain = typeof attachment?.toJSON === "function" ? attachment.toJSON() : attachment;
  if (!plain) return null;
  return {
    id: plain.id,
    fileId: plain.fileId,
    originalName: plain.originalName,
    mimeType: plain.mimeType,
    sizeBytes: plain.sizeBytes,
    status: plain.status,
    createdAt: plain.createdAt?.toISOString?.() ?? plain.createdAt,
  };
}

export function serializeFileAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map(serializeFileAttachment).filter(Boolean);
}

function normalizeMimeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
}

function validateUploadInput({ filename, mimeType, sizeBytes }) {
  const normalizedMime = normalizeMimeType(mimeType);
  if (!allowedMimeTypes.has(normalizedMime)) {
    return { error: "Only JPEG, PNG, GIF, and WebP images are allowed", status: 400 };
  }

  const size = Number(sizeBytes);
  if (!Number.isInteger(size) || size <= 0) {
    return { error: "Invalid file size", status: 400 };
  }
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      error: `Image is too large (max ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))} MB)`,
      status: 400,
    };
  }

  const originalName = sanitizeAttachmentFilename(filename);
  if (!originalName) {
    return { error: "Filename is required", status: 400 };
  }

  return { originalName, mimeType: normalizedMime, sizeBytes: size };
}

async function countAttachedImages(fileId) {
  return db.UserFileAttachment.count({
    where: { fileId, status: "attached" },
  });
}

export async function createPendingFileAttachmentUpload({ fileId, userId, filename, mimeType, sizeBytes }) {
  if (!isAttachmentStorageAvailable()) {
    return { error: "File attachments are not configured on this server", status: 503 };
  }

  const id = Number(fileId);
  const uid = Number(userId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(uid) || uid <= 0) {
    return { error: "Invalid file", status: 400 };
  }

  const attachedCount = await countAttachedImages(id);
  if (attachedCount >= MAX_IMAGES_PER_FILE) {
    return { error: `You can attach up to ${MAX_IMAGES_PER_FILE} images per file`, status: 400 };
  }

  const validated = validateUploadInput({ filename, mimeType, sizeBytes });
  if (validated.error) return validated;

  const storageKey = buildFileAttachmentStorageKey(id, validated.originalName);
  const attachment = await db.UserFileAttachment.create({
    fileId: id,
    userId: uid,
    storageKey,
    originalName: validated.originalName,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    status: "pending",
  });

  const uploadTarget = await createUploadTarget({
    attachmentId: attachment.id,
    storageKey,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    uploadUrl: `/api/files/attachments/${attachment.id}/upload`,
  });

  return {
    attachment: serializeFileAttachment(attachment),
    uploadUrl: uploadTarget.uploadUrl,
    uploadMode: uploadTarget.mode,
    expiresIn: uploadTarget.expiresIn,
  };
}

function isMissingStoredAttachmentError(err) {
  if (!err) return false;
  const code = String(err.name || err.code || err.Code || "").toLowerCase();
  const status = Number(err.$metadata?.httpStatusCode || err.statusCode || err.status || 0);
  const message = String(err.message || "").toLowerCase();
  if (status === 404) return true;
  if (code.includes("notfound") || code === "nosuchkey" || code === "enoent") return true;
  if (message.includes("no such file") || message.includes("not found") || message.includes("nosuchkey")) {
    return true;
  }
  return false;
}

async function verifyPendingAttachmentInStorage(attachment) {
  try {
    const meta = await headStoredAttachment(attachment.storageKey);
    if (meta.sizeBytes !== Number(attachment.sizeBytes)) {
      return { error: `Upload incomplete for ${attachment.originalName}`, status: 400 };
    }
    const expectedMime = normalizeMimeType(attachment.mimeType);
    const actualMime = normalizeMimeType(meta.mimeType);
    if (actualMime && expectedMime && actualMime !== expectedMime) {
      return { error: `Uploaded file type mismatch for ${attachment.originalName}`, status: 400 };
    }
    return null;
  } catch {
    return { error: `Image was not uploaded for ${attachment.originalName}`, status: 400 };
  }
}

export async function finalizeFileAttachmentUpload(attachment) {
  const verifyError = await verifyPendingAttachmentInStorage(attachment);
  if (verifyError) return verifyError;

  const attachedCount = await countAttachedImages(attachment.fileId);
  if (attachedCount >= MAX_IMAGES_PER_FILE) {
    return { error: `You can attach up to ${MAX_IMAGES_PER_FILE} images per file`, status: 400 };
  }

  await attachment.update({ status: "attached" });
  return { attachment: serializeFileAttachment(attachment) };
}

export async function getFileAttachmentAccessUrl(attachment, { disposition = "inline" } = {}) {
  if (!attachment || attachment.status !== "attached") {
    return { error: "Attachment not found", status: 404 };
  }

  if (!isAttachmentStorageAvailable()) {
    return { error: "File attachments are not configured on this server", status: 503 };
  }

  try {
    await headStoredAttachment(attachment.storageKey);
  } catch (err) {
    if (isMissingStoredAttachmentError(err)) {
      return {
        error: "This image is no longer available. It may have been removed from storage.",
        status: 404,
      };
    }
    return {
      error: "Could not access the image. Please try again.",
      status: 503,
    };
  }

  const localPath =
    disposition === "attachment"
      ? `/api/files/attachments/${attachment.id}/file?disposition=attachment`
      : `/api/files/attachments/${attachment.id}/file?disposition=inline`;

  try {
    const target = await createDownloadTarget(attachment, {
      downloadUrl: localPath,
      disposition,
    });
    return {
      url: target.downloadUrl,
      expiresIn: target.expiresIn,
      attachment: serializeFileAttachment(attachment),
    };
  } catch {
    return {
      error: "Could not prepare the image. Please try again.",
      status: 503,
    };
  }
}

export async function deleteFileAttachment(attachment) {
  if (!attachment) {
    return { error: "Attachment not found", status: 404 };
  }
  if (attachment.status === "deleted") {
    return { attachment: serializeFileAttachment(attachment), alreadyDeleted: true };
  }

  try {
    await deleteStoredAttachment(attachment.storageKey);
  } catch {
    return {
      error: "Failed to delete image from storage. Please try again.",
      status: 503,
    };
  }

  await attachment.update({ status: "deleted" });
  return { attachment: serializeFileAttachment(attachment), alreadyDeleted: false };
}

export async function copyFileAttachments({ sourceFileId, targetFileId, userId }) {
  const sourceId = Number(sourceFileId);
  const targetId = Number(targetFileId);
  const uid = Number(userId);
  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || !Number.isInteger(uid)) {
    return;
  }

  const rows = await db.UserFileAttachment.findAll({
    where: { fileId: sourceId, status: "attached" },
    order: [["id", "ASC"]],
  });

  for (const row of rows.slice(0, MAX_IMAGES_PER_FILE)) {
    try {
      const bytes = await readStoredAttachment(row.storageKey);
      const storageKey = buildFileAttachmentStorageKey(targetId, row.originalName);
      await writeStoredAttachment(storageKey, bytes, row.mimeType);
      await db.UserFileAttachment.create({
        fileId: targetId,
        userId: uid,
        storageKey,
        originalName: row.originalName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        status: "attached",
      });
    } catch {
      /* skip missing or unreadable source images */
    }
  }
}
