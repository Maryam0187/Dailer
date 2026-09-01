import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import db from "@/server/db";
import { getConversationForUser } from "@/server/messages/messageAccess";
import { getAttachmentDownloadUrl } from "@/server/messages/messageAttachments";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
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
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const access = await getConversationForUser(attachment.conversationId, authedUser);
  if (!access) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const result = await getAttachmentDownloadUrl(attachment);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    downloadUrl: result.downloadUrl,
    expiresIn: result.expiresIn,
    attachment: result.attachment,
  });
}
