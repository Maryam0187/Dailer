import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { parseClientActivityEvents } from "@/server/activity/clientActivityActions";

export const runtime = "nodejs";

async function resolveSessionId() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret);
    return payload?.sid ? String(payload.sid) : null;
  } catch {
    return null;
  }
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { error, events } = parseClientActivityEvents(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const sessionId = await resolveSessionId();

  await Promise.all(
    events.map(({ action, metadata, entityType, entityId }) =>
      logUserActivity({
        req,
        userId: authedUser.id,
        action,
        entityType,
        entityId,
        sessionId,
        metadata,
      }),
    ),
  );

  return NextResponse.json({ ok: true, logged: events.length });
}
