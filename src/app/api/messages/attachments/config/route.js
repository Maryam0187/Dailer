import { NextResponse } from "next/server";
import { getAttachmentUploadConfig } from "@/server/messages/attachmentConfig";
import { getAttachmentStorageMode } from "@/server/messages/attachmentStorage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...getAttachmentUploadConfig(),
    storageMode: getAttachmentStorageMode(),
  });
}
