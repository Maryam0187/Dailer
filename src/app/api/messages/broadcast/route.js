import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  broadcastMessageToUsers,
  stripMessageModerationFlags,
} from "@/server/messages/messageAccess";
import { emitToUser } from "@/server/socketHub";
import { buildMessagePushCopy, notifyOfflineMessage } from "@/server/push/oneSignal";

export const runtime = "nodejs";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authedUser.accessMode === "limited") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (authedUser.role !== "admin" && authedUser.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await broadcastMessageToUsers(authedUser, {
    body: payload?.body,
    recipientUserIds: payload?.recipientUserIds,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const push = buildMessagePushCopy({
    senderName: authedUser.username,
    messageBody: payload?.body,
  });

  for (const item of result.sent) {
    emitToUser(item.userId, "message:new", {
      conversationId: item.conversationId,
      message: stripMessageModerationFlags(item.message),
    });
    emitToUser(authedUser.id, "message:new", {
      conversationId: item.conversationId,
      message: item.message,
      self: true,
    });
    notifyOfflineMessage(item.userId, {
      title: push.title,
      body: push.body,
      conversationId: item.conversationId,
    });
  }

  return NextResponse.json({
    sent: result.sent.map(({ userId, conversationId, messageId }) => ({
      userId,
      conversationId,
      messageId,
    })),
    failed: result.failed,
  });
}
