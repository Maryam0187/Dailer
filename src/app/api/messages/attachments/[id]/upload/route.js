import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import db from "@/server/db";
import { getAllowedAttachmentMimeTypes, MAX_ATTACHMENT_SIZE_BYTES } from "@/server/messages/attachmentConfig";
import { getAttachmentStorageMode, writeStoredAttachment } from "@/server/messages/attachmentStorage";

export const runtime = "nodejs";

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

  const attachment = await db.MessageAttachment.findByPk(attachmentId);
  if (
    !attachment ||
    attachment.status !== "pending" ||
    Number(attachment.userId) !== Number(authedUser.id)
  ) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const mimeType = normalizeMimeType(file.type);
  if (!getAllowedAttachmentMimeTypes().has(mimeType)) {
    return NextResponse.json({ error: "File type is not allowed" }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 400 });
  }
  if (file.size !== Number(attachment.sizeBytes)) {
    return NextResponse.json({ error: "Uploaded file size does not match" }, { status: 400 });
  }
  if (mimeType !== normalizeMimeType(attachment.mimeType)) {
    return NextResponse.json({ error: "Uploaded file type does not match" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeStoredAttachment(attachment.storageKey, bytes, mimeType);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to save attachment" },
      { status: 500 },
    );
  }
}
