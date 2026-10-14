import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getNotificationScheduleForUser } from "@/server/push/notificationSchedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/schedule/status?userId=
 * Whether that user is currently in quiet hours (for Notify anyway UI).
 */
export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = Number(url.searchParams.get("userId"));
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const schedule = await getNotificationScheduleForUser(userId);
  return NextResponse.json({
    ok: true,
    userId,
    inQuietHours: Boolean(schedule.inQuietHours),
    scheduleEnabled: Boolean(schedule.scheduleEnabled),
    timezone: schedule.timezone,
    allowStartLocal: schedule.allowStartLocal,
    allowEndLocal: schedule.allowEndLocal,
    allowDaysLabels: schedule.allowDaysLabels,
  });
}
