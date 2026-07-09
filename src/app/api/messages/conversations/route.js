import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  canMessageUser,
  findOrCreateDm,
  listConversationsForUser,
} from "@/server/messages/messageAccess";
import db from "@/server/db";
import { derivePresence } from "@/server/auth/presence";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversations, totalUnread } = await listConversationsForUser(authedUser);
  return NextResponse.json({ conversations, totalUnread });
}

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

  const recipientUserId = Number(body?.recipientUserId);
  if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
    return NextResponse.json({ error: "recipientUserId is required" }, { status: 400 });
  }

  const allowed = await canMessageUser(authedUser, recipientUserId);
  if (!allowed) {
    return NextResponse.json({ error: "Cannot message this user" }, { status: 403 });
  }

  const result = await findOrCreateDm(authedUser.id, recipientUserId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const peer = await db.User.findByPk(recipientUserId, {
    attributes: ["id", "username", "role", "activeSessionId", "activeSessionLastSeenAt"],
  });
  const presence = peer
    ? derivePresence({
        id: peer.id,
        activeSessionId: peer.activeSessionId,
        activeSessionLastSeenAt: peer.activeSessionLastSeenAt,
      })
    : { status: "offline", lastActiveAt: null };

  return NextResponse.json({
    conversation: {
      id: result.conversation.id,
      lastMessageAt: result.conversation.lastMessageAt,
      unreadCount: 0,
      isOversight: false,
      canSend: true,
      peer: peer
        ? {
            id: peer.id,
            username: peer.username,
            role: peer.role,
            presence: presence.status,
            lastActiveAt: presence.lastActiveAt,
          }
        : {
            id: recipientUserId,
            username: "Unknown",
            role: null,
            presence: "offline",
            lastActiveAt: null,
          },
      participants: null,
      lastMessage: null,
    },
  });
}
