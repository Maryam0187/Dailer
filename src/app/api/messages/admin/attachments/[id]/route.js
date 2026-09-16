import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import db from "@/server/db";
import { deleteAttachmentForAdmin } from "@/server/messages/messageAttachments";
import {
  serializeMessage,
  stripMessageModerationFlags,
} from "@/server/messages/messageAccess";
import { emitToUser } from "@/server/socketHub";

export const runtime = "nodejs";

function emitToConversationParticipants(conversation, event, payload) {
  const lowId = Number(conversation?.dmUserLowId);
  const highId = Number(conversation?.dmUserHighId);
  if (Number.isInteger(lowId) && lowId > 0) {
    emitToUser(lowId, event, payload);
  }
  if (Number.isInteger(highId) && highId > 0) {
    emitToUser(highId, event, payload);
  }
}

export async function DELETE(_req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const result = await deleteAttachmentForAdmin(authedUser, id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const conversationId = Number(result.conversationId);
  const messageId = Number(result.messageId);
  if (
    Number.isInteger(conversationId) &&
    conversationId > 0 &&
    Number.isInteger(messageId) &&
    messageId > 0 &&
    !result.alreadyDeleted
  ) {
    const [conversation, message] = await Promise.all([
      db.Conversation.findByPk(conversationId),
      db.Message.findByPk(messageId, {
        include: [
          {
            model: db.User,
            as: "author",
            attributes: ["id", "username", "role"],
            required: false,
          },
          {
            model: db.MessageAttachment,
            as: "attachments",
            where: { status: "attached" },
            required: false,
          },
        ],
      }),
    ]);

    if (conversation && message && !message.deletedAt) {
      const serialized = serializeMessage(message, authedUser);
      const participantPayload = {
        conversationId,
        message: stripMessageModerationFlags(serialized),
      };
      emitToConversationParticipants(conversation, "message:updated", participantPayload);
      emitToUser(authedUser.id, "message:updated", {
        conversationId,
        message: serialized,
        self: true,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    alreadyDeleted: Boolean(result.alreadyDeleted),
    attachment: result.attachment,
  });
}
