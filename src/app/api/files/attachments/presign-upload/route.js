import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canManageFileImages, getAccessibleFile } from "@/server/files/fileAccess";
import { createPendingFileAttachmentUpload } from "@/server/files/fileAttachments";

export const runtime = "nodejs";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fileId = Number(body?.fileId);
  const file = await getAccessibleFile(fileId, authedUser);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (!canManageFileImages(authedUser, file)) {
    return NextResponse.json(
      { error: "Only an admin, or a user granted access, can add images to this file" },
      { status: 403 },
    );
  }

  const result = await createPendingFileAttachmentUpload({
    fileId,
    userId: authedUser.id,
    filename: body?.filename,
    mimeType: body?.mimeType,
    sizeBytes: body?.sizeBytes,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    attachment: result.attachment,
    uploadUrl: result.uploadUrl,
    uploadMode: result.uploadMode,
    expiresIn: result.expiresIn,
  });
}
