import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canManageFileImages, getAccessibleFile } from "@/server/files/fileAccess";
import { deleteFileAttachment, serializeFileAttachment } from "@/server/files/fileAttachments";

export const runtime = "nodejs";

export async function DELETE(_req, { params }) {
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
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const file = await getAccessibleFile(attachment.fileId, authedUser);
  if (!file) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  if (!canManageFileImages(authedUser, file)) {
    return NextResponse.json(
      { error: "Only an admin, or a user granted access, can remove images from this file" },
      { status: 403 },
    );
  }

  const result = await deleteFileAttachment(attachment);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    alreadyDeleted: result.alreadyDeleted,
    attachment: result.attachment || serializeFileAttachment(attachment),
  });
}
