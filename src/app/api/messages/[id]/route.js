import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import db from "@/server/db";
import {
  deleteMessage,
  stripMessageModerationFlags,
  updateMessage,
} from "@/server/messages/messageAccess";
import { emitToUser } from "@/server/socketHub";

export const runtime = "nodejs";

function emitToConversationParticipants(conversation, event, payload) {
  const lowId = Number(conversation.dmUserLowId);
  const highId = Number(conversation.dmUserHighId);
  if (Number.isInteger(lowId) && lowId > 0) {
    emitToUser(lowId, event, payload);
  }
  if (Number.isInteger(highId) && highId > 0) {
    emitToUser(highId, event, payload);
  }
}

export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await updateMessage(id, authedUser, body?.body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const conversation = await db.Conversation.findByPk(result.conversationId);

  const payload = {
    conversationId: result.conversationId,
    message: stripMessageModerationFlags(result.message),
  };

  if (conversation) {
    emitToConversationParticipants(conversation, "message:updated", payload);
  }
  emitToUser(authedUser.id, "message:updated", {
    conversationId: result.conversationId,
    message: result.message,
    self: true,
  });

  return NextResponse.json({ message: result.message });
}

export async function DELETE(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const result = await deleteMessage(id, authedUser);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const conversation = await db.Conversation.findByPk(result.conversationId);

  const payload = {
    conversationId: result.conversationId,
    messageId: result.messageId,
  };

  if (conversation) {
    emitToConversationParticipants(conversation, "message:deleted", payload);
  }
  emitToUser(authedUser.id, "message:deleted", { ...payload, self: true });

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
