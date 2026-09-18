import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getAccessibleFile } from "@/server/files/fileAccess";
import { getFileAttachmentAccessUrl } from "@/server/files/fileAttachments";

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

  const attachment = await db.UserFileAttachment.findByPk(attachmentId);
  if (!attachment || attachment.status !== "attached") {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const file = await getAccessibleFile(attachment.fileId, authedUser);
  if (!file) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const result = await getFileAttachmentAccessUrl(attachment, { disposition: "inline" });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    previewUrl: result.url,
    expiresIn: result.expiresIn,
    attachment: result.attachment,
  });
}
