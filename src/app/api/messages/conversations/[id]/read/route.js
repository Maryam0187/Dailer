import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  getConversationForUser,
  listConversationsForUser,
  markConversationRead,
} from "@/server/messages/messageAccess";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getConversationForUser(id, authedUser);
  if (!access) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Don't create a participant row for admin oversight views
  if (access.isParticipant) {
    await markConversationRead(access.conversation.id, authedUser.id);
  }

  const { totalUnread } = await listConversationsForUser(authedUser);

  return NextResponse.json({ ok: true, totalUnread });
}
