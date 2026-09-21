import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canViewAllFiles, getAccessibleFile } from "@/server/files/fileAccess";
import { getAttachmentStorageMode, readStoredAttachment } from "@/server/messages/attachmentStorage";
import { sanitizeAttachmentFilename } from "@/server/messages/objectStorage";
import { resolveFileImageMimeType } from "@/lib/fileImageMime";

export const runtime = "nodejs";

function isMissingFileError(err) {
  if (!err) return false;
  const code = String(err.code || err.name || "").toLowerCase();
  const message = String(err.message || "").toLowerCase();
  return code === "enoent" || message.includes("no such file") || message.includes("not found");
}

export async function GET(req, { params }) {
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

  const { searchParams } = new URL(req.url);
  const disposition = searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
  if (disposition === "attachment" && !canViewAllFiles(authedUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachment = await db.UserFileAttachment.findByPk(attachmentId);
  if (!attachment || attachment.status !== "attached") {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const file = await getAccessibleFile(attachment.fileId, authedUser);
  if (!file) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  try {
    const fileBuffer = await readStoredAttachment(attachment.storageKey);
    const bytes = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    const body = Uint8Array.from(bytes);
    const filename = sanitizeAttachmentFilename(attachment.originalName, "image");
    const contentType =
      resolveFileImageMimeType({
        mimeType: attachment.mimeType,
        filename: attachment.originalName,
      }) || "application/octet-stream";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isMissingFileError(err)) {
      return NextResponse.json(
        { error: "This image is no longer available. It may have been removed from storage." },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "Failed to read image file" }, { status: 404 });
  }
}
