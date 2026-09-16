export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/** Turn accept string like ".doc,.docx,.pdf" into a short UI label. */
export function formatAllowedAttachmentTypesLabel(accept, fallback = ".doc, .docx") {
  const parts = String(accept || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => (part.startsWith(".") ? part : `.${part}`));
  if (!parts.length) return fallback;
  return [...new Set(parts)].join(", ");
}

export function isImageAttachment(mimeType) {
  return String(mimeType || "").toLowerCase().startsWith("image/");
}

export function messagePreviewText(message) {
  const body = typeof message?.body === "string" ? message.body.trim() : "";
  if (body) return body;

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!attachments.length) return "";

  if (attachments.length === 1) {
    return `📎 ${attachments[0].originalName}`;
  }
  return `📎 ${attachments.length} files`;
}
