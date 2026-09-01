import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getConversationForUser } from "@/server/messages/messageAccess";
import { createPendingAttachmentUpload } from "@/server/messages/messageAttachments";

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

  const conversationId = Number(body?.conversationId);
  const access = await getConversationForUser(conversationId, authedUser, { forWrite: true });
  if (!access) {
    return NextResponse.json(
      { error: "Conversation not found or you cannot send here" },
      { status: 404 },
    );
  }

  const result = await createPendingAttachmentUpload({
    conversationId,
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
