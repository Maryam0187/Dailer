import {
  PRESIGN_DOWNLOAD_EXPIRY_SEC,
  PRESIGN_UPLOAD_EXPIRY_SEC,
} from "@/server/messages/attachmentConfig";
import {
  deleteLocalAttachment,
  headLocalAttachment,
  isLocalAttachmentStorageEnabled,
  writeLocalAttachment,
} from "@/server/messages/localAttachmentStorage";
import {
  createPresignedDownloadUrl,
  deleteObjectAttachment,
  headObjectMetadata,
  isObjectStorageConfigured,
  writeObjectAttachment,
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
  if (mode === "s3" || mode === "local") {
    return {
      mode,
      uploadUrl: `/api/messages/attachments/${attachmentId}/upload`,
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SEC,
    };
  }
  throw new Error("Attachment storage is not configured");
}

export async function writeStoredAttachment(storageKey, data, mimeType) {
  const mode = getAttachmentStorageMode();
  if (mode === "local") {
    await writeLocalAttachment(storageKey, data);
    return;
  }
  if (mode === "s3") {
    await writeObjectAttachment(storageKey, data, mimeType);
    return;
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

/** Best-effort remove from disk/S3. Missing objects are treated as already gone. */
export async function deleteStoredAttachment(storageKey) {
  const mode = getAttachmentStorageMode();
  if (!mode || !storageKey) return { deleted: false, mode: null };

  try {
    if (mode === "local") {
      await deleteLocalAttachment(storageKey);
      return { deleted: true, mode };
    }
    if (mode === "s3") {
      await deleteObjectAttachment(storageKey);
      return { deleted: true, mode };
    }
  } catch (err) {
    const code = String(err?.name || err?.code || err?.Code || "").toLowerCase();
    const status = Number(err?.$metadata?.httpStatusCode || err?.statusCode || 0);
    const message = String(err?.message || "").toLowerCase();
    if (
      status === 404 ||
      code === "enoent" ||
      code.includes("notfound") ||
      code === "nosuchkey" ||
      message.includes("no such file") ||
      message.includes("not found") ||
      message.includes("nosuchkey")
    ) {
      return { deleted: false, mode, missing: true };
    }
    throw err;
  }

  return { deleted: false, mode };
}
