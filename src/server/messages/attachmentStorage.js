import {
  PRESIGN_DOWNLOAD_EXPIRY_SEC,
  PRESIGN_UPLOAD_EXPIRY_SEC,
} from "@/server/messages/attachmentConfig";
import {
  headLocalAttachment,
  isLocalAttachmentStorageEnabled,
} from "@/server/messages/localAttachmentStorage";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  headObjectMetadata,
  isObjectStorageConfigured,
} from "@/server/messages/objectStorage";

export function getAttachmentStorageMode() {
  if (isObjectStorageConfigured()) return "s3";
  if (isLocalAttachmentStorageEnabled()) return "local";
  return null;
}

export function isAttachmentStorageAvailable() {
  return getAttachmentStorageMode() !== null;
}

export async function createUploadTarget({ attachmentId, storageKey, mimeType, sizeBytes }) {
  const mode = getAttachmentStorageMode();
  if (mode === "s3") {
    const presign = await createPresignedUploadUrl({ storageKey, mimeType, sizeBytes });
    return {
      mode,
      uploadUrl: presign.uploadUrl,
      expiresIn: presign.expiresIn,
    };
  }
  if (mode === "local") {
    return {
      mode,
      uploadUrl: `/api/messages/attachments/${attachmentId}/upload`,
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SEC,
    };
  }
  throw new Error("Attachment storage is not configured");
}

export async function headStoredAttachment(storageKey) {
  const mode = getAttachmentStorageMode();
  if (mode === "s3") {
    return headObjectMetadata(storageKey);
  }
  if (mode === "local") {
    return headLocalAttachment(storageKey);
  }
  throw new Error("Attachment storage is not configured");
}

export async function createDownloadTarget(attachment) {
  const mode = getAttachmentStorageMode();
  if (mode === "s3") {
    const presign = await createPresignedDownloadUrl({
      storageKey: attachment.storageKey,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
    });
    return {
      mode,
      downloadUrl: presign.downloadUrl,
      expiresIn: presign.expiresIn,
    };
  }
  if (mode === "local") {
    return {
      mode,
      downloadUrl: `/api/messages/attachments/${attachment.id}/file`,
      expiresIn: PRESIGN_DOWNLOAD_EXPIRY_SEC,
    };
  }
  throw new Error("Attachment storage is not configured");
}
