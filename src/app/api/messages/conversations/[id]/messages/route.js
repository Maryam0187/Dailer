import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createMessage,
  getConversationForUser,
  listMessages,
  otherDmUserId,
} from "@/server/messages/messageAccess";
import { emitToUser } from "@/server/socketHub";

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

  const messages = await listMessages(access.conversation.id, {
    beforeId: beforeId ? Number(beforeId) : null,
    limit: limit ? Number(limit) : 50,
  });

  return NextResponse.json({
    messages,
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

  const result = await createMessage(access.conversation, authedUser, body?.body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const recipientId = otherDmUserId(access.conversation, authedUser.id);
  if (recipientId) {
    emitToUser(recipientId, "message:new", {
      conversationId: access.conversation.id,
      message: result.message,
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
