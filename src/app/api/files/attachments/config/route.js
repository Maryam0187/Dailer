import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getFileImageUploadConfig } from "@/server/files/fileAttachments";
import { getAttachmentStorageMode } from "@/server/messages/attachmentStorage";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ...getFileImageUploadConfig(),
    storageMode: getAttachmentStorageMode(),
  });
}
