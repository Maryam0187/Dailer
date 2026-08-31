export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const PRESIGN_UPLOAD_EXPIRY_SEC = 600;
export const PRESIGN_DOWNLOAD_EXPIRY_SEC = 900;

const DEFAULT_ALLOWED_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MIME_TO_EXTENSION = {
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg,.jpeg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

let cachedAllowedMimeTypes = null;

export function getAllowedAttachmentMimeTypes() {
  if (cachedAllowedMimeTypes) {
    return cachedAllowedMimeTypes;
  }

  const raw = String(process.env.MESSAGE_ATTACHMENT_ALLOWED_MIME_TYPES || "").trim();
  const values = raw
    ? raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ALLOWED_MIME_TYPES;

  cachedAllowedMimeTypes = new Set(values);
  return cachedAllowedMimeTypes;
}

export function getAttachmentUploadConfig() {
  const mimeTypes = [...getAllowedAttachmentMimeTypes()];
  const extensions = mimeTypes.flatMap((mimeType) => {
    const mapped = MIME_TO_EXTENSION[mimeType];
    return mapped ? mapped.split(",") : [];
  });
  const accept = [...new Set(extensions)].join(",");

  return {
    mimeTypes,
    accept,
    maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
    maxAttachmentsPerMessage: MAX_ATTACHMENTS_PER_MESSAGE,
  };
}
