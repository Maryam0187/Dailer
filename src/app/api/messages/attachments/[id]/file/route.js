import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import db from "@/server/db";
import { getConversationForUser } from "@/server/messages/messageAccess";
import { getAttachmentStorageMode } from "@/server/messages/attachmentStorage";
import { readLocalAttachment } from "@/server/messages/localAttachmentStorage";
import { sanitizeAttachmentFilename } from "@/server/messages/objectStorage";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  if (getAttachmentStorageMode() !== "local") {
    return NextResponse.json({ error: "Local file download is not enabled" }, { status: 404 });
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
  if (!attachment || attachment.status !== "attached") {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const access = await getConversationForUser(attachment.conversationId, authedUser);
  if (!access) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  try {
    const fileBuffer = await readLocalAttachment(attachment.storageKey);
    const filename = sanitizeAttachmentFilename(attachment.originalName, "download");
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read attachment file" }, { status: 404 });
  }
}
