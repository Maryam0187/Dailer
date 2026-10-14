import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createMessage,
  getConversationForUser,
  listMessages,
  otherDmUserId,
  stripMessageModerationFlags,
} from "@/server/messages/messageAccess";
import { emitToUser } from "@/server/socketHub";
import { buildMessagePushCopy, notifyOfflineMessage } from "@/server/push/oneSignal";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getConversationForUser(id, authedUser);
  if (!access) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const beforeId = url.searchParams.get("beforeId");
  const limit = url.searchParams.get("limit");

  const { messages, hasMore } = await listMessages(access.conversation.id, {
    beforeId: beforeId ? Number(beforeId) : null,
    limit: limit ? Number(limit) : 10,
    viewer: authedUser,
  });

  return NextResponse.json({
    messages,
    hasMore,
    isOversight: access.isOversight,
    canSend: access.isParticipant,
  });
}

export async function POST(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getConversationForUser(id, authedUser, { forWrite: true });
  if (!access) {
    return NextResponse.json(
      { error: "Conversation not found or you cannot send here" },
      { status: 404 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createMessage(access.conversation, authedUser, body?.body, {
    attachmentIds: body?.attachmentIds,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const recipientId = otherDmUserId(access.conversation, authedUser.id);
  if (recipientId) {
    emitToUser(recipientId, "message:new", {
      conversationId: access.conversation.id,
      message: stripMessageModerationFlags(result.message),
    });

    const hasAttachments = Array.isArray(result.message?.attachments)
      ? result.message.attachments.length > 0
      : false;
    const push = buildMessagePushCopy({
      senderName: authedUser.username || result.message?.author?.username,
      messageBody: result.message?.body,
      hasAttachments,
    });
    notifyOfflineMessage(recipientId, {
      title: push.title,
      body: push.body,
      conversationId: access.conversation.id,
    });
  }

  // Also notify the sender's other tabs so inbox previews stay in sync
  emitToUser(authedUser.id, "message:new", {
    conversationId: access.conversation.id,
    message: result.message,
    self: true,
  });

  return NextResponse.json({ message: result.message });
}
