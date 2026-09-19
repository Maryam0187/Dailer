import { resolveFileImageMimeType } from "@/lib/fileImageMime";

export async function fetchFileAttachmentPreviewUrl(attachmentId) {
  const res = await fetch(`/api/files/attachments/${attachmentId}/preview-url`, {
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to load image preview");
  }
  if (!data.previewUrl) {
    throw new Error("This image is no longer available. It may have been removed from storage.");
  }
  return data.previewUrl;
}

export async function fetchFileAttachmentDownloadUrl(attachmentId) {
  const res = await fetch(`/api/files/attachments/${attachmentId}/download-url`, {
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to get download link");
  }
  if (!data.downloadUrl) {
    throw new Error("This image is no longer available. It may have been removed from storage.");
  }
  return data.downloadUrl;
}

export async function uploadFileImage({ file, fileId, config, currentCount }) {
  const mimeType = resolveFileImageMimeType({ mimeType: file.type, filename: file.name });
  const mimeTypeSet = config?.mimeTypeSet ?? new Set();
  const maxSizeBytes = Number(config?.maxSizeBytes) || 10 * 1024 * 1024;
  const maxCount = Number(config?.maxAttachmentsPerFile) || 5;

  if (!mimeType || (mimeTypeSet.size && !mimeTypeSet.has(mimeType))) {
    throw new Error("Only JPEG, PNG, GIF, and WebP images are allowed");
  }
  if (file.size > maxSizeBytes) {
    throw new Error(`Image is too large (max ${Math.round(maxSizeBytes / (1024 * 1024))} MB)`);
  }
  if (currentCount >= maxCount) {
    throw new Error(`You can attach up to ${maxCount} images per file`);
  }

  const presignRes = await fetch("/api/files/attachments/presign-upload", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    }),
  });
  const presignData = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok) {
    throw new Error(presignData.error || "Failed to prepare upload");
  }

  const formData = new FormData();
  formData.append("file", file);
  const uploadRes = await fetch(presignData.uploadUrl, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    throw new Error(uploadData.error || "Upload failed");
  }

  return uploadData.attachment || presignData.attachment;
}

export async function deleteFileImage(attachmentId) {
  const res = await fetch(`/api/files/attachments/${attachmentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to remove image");
  }
  return data;
}
