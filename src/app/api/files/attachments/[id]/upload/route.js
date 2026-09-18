import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canManageFileImages, getAccessibleFile } from "@/server/files/fileAccess";
import {
  FILE_IMAGE_MIME_TYPES,
  finalizeFileAttachmentUpload,
} from "@/server/files/fileAttachments";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/server/messages/attachmentConfig";
import { getAttachmentStorageMode, writeStoredAttachment } from "@/server/messages/attachmentStorage";

export const runtime = "nodejs";

const allowedMimeTypes = new Set(FILE_IMAGE_MIME_TYPES);

function normalizeMimeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
}

export async function POST(req, { params }) {
  if (!getAttachmentStorageMode()) {
    return NextResponse.json({ error: "Attachment storage is not configured" }, { status: 503 });
  }

  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }

  const attachment = await db.UserFileAttachment.findByPk(attachmentId);
  if (
    !attachment ||
    attachment.status !== "pending" ||
    Number(attachment.userId) !== Number(authedUser.id)
  ) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const file = await getAccessibleFile(attachment.fileId, authedUser);
  if (!file || !canManageFileImages(authedUser, file)) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const uploaded = form?.get("file");
  if (!uploaded || typeof uploaded === "string") {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const mimeType = normalizeMimeType(uploaded.type);
  if (!allowedMimeTypes.has(mimeType)) {
    return NextResponse.json({ error: "Only JPEG, PNG, GIF, and WebP images are allowed" }, { status: 400 });
  }
  if (uploaded.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 400 });
  }
  if (uploaded.size !== Number(attachment.sizeBytes)) {
    return NextResponse.json({ error: "Uploaded file size does not match" }, { status: 400 });
  }
  if (mimeType !== normalizeMimeType(attachment.mimeType)) {
    return NextResponse.json({ error: "Uploaded file type does not match" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await uploaded.arrayBuffer());
    await writeStoredAttachment(attachment.storageKey, bytes, mimeType);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to save image" },
      { status: 500 },
    );
  }

  const result = await finalizeFileAttachmentUpload(attachment);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, attachment: result.attachment });
}
