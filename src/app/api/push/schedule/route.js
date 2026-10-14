import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  getNotificationScheduleForUser,
  upsertNotificationSchedule,
} from "@/server/push/notificationSchedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/push/schedule — own notification hours. */
export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedule = await getNotificationScheduleForUser(authedUser.id);
  return NextResponse.json({ ok: true, schedule });
}

/** PUT /api/push/schedule — save own notification hours. */
export async function PUT(req) {
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

  const result = await upsertNotificationSchedule(authedUser.id, body || {});
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Save failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, schedule: result.schedule });
}
