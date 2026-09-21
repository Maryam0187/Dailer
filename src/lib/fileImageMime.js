export const FILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const MIME_ALIASES = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export function resolveFileImageMimeType({ mimeType, filename } = {}) {
  const raw = String(mimeType || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
  const aliased = MIME_ALIASES[raw] || raw;
  if (FILE_IMAGE_MIME_TYPES.includes(aliased)) return aliased;

  const ext = String(filename || "")
    .split(/[/\\]/)
    .pop()
    .split(".")
    .pop()
    ?.toLowerCase();
  return EXT_TO_MIME[ext] || "";
}
