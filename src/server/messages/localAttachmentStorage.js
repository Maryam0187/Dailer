import fs from "node:fs/promises";
import path from "node:path";

export function isLocalAttachmentStorageEnabled() {
  const override = String(process.env.MESSAGE_ATTACHMENTS_USE_LOCAL_STORAGE || "").trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes") return true;
  if (override === "false" || override === "0" || override === "no") return false;
  return process.env.NODE_ENV !== "production";
}

export function getLocalAttachmentsDir() {
  const configured = String(process.env.MESSAGE_ATTACHMENTS_LOCAL_DIR || "").trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "storage", "message-attachments");
}

export function resolveLocalAttachmentPath(storageKey) {
  const root = path.resolve(getLocalAttachmentsDir());
  const normalizedKey = String(storageKey || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalizedKey || normalizedKey.includes("..")) {
    throw new Error("Invalid storage key");
  }

  const filePath = path.resolve(root, normalizedKey);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage key");
  }
  return filePath;
}

async function ensureParentDir(storageKey) {
  const filePath = resolveLocalAttachmentPath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return filePath;
}

export async function writeLocalAttachment(storageKey, data) {
  const filePath = await ensureParentDir(storageKey);
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function headLocalAttachment(storageKey) {
  const filePath = resolveLocalAttachmentPath(storageKey);
  const stat = await fs.stat(filePath);
  return {
    sizeBytes: stat.size,
    mimeType: "",
  };
}

export async function readLocalAttachment(storageKey) {
  const filePath = resolveLocalAttachmentPath(storageKey);
  return fs.readFile(filePath);
}
