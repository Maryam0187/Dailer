import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import db from "@/server/db";
import { listPushDevicesForUsers } from "@/server/push/oneSignal";
import { describeOneSignalAuth } from "@/server/push/oneSignalEnv";
import { getNotificationScheduleForUser } from "@/server/push/notificationSchedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/push/admin/devices — all users' push devices (admin only). */
export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auth = describeOneSignalAuth();
  if (!auth.serverPushReady) {
    return NextResponse.json({
      ok: false,
      users: [],
      auth: { serverPushReady: false, hint: auth.hint },
      error: auth.hint || "Push not configured",
    });
  }

  const users = await db.User.findAll({
    attributes: ["id", "username", "role", "active"],
    order: [["username", "ASC"]],
  });

  const rows = await listPushDevicesForUsers(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      active: u.active,
    })),
  );

  const withSchedule = [];
  for (const row of rows) {
    const schedule = await getNotificationScheduleForUser(row.userId);
    withSchedule.push({
      ...row,
      schedule: {
        scheduleEnabled: schedule.scheduleEnabled,
        inQuietHours: schedule.inQuietHours,
        timezone: schedule.timezone,
        allowStartLocal: schedule.allowStartLocal,
        allowEndLocal: schedule.allowEndLocal,
        allowDaysLabels: schedule.allowDaysLabels,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    users: withSchedule,
    totals: {
      users: withSchedule.length,
      withDevices: withSchedule.filter((u) => u.subscribedCount > 0).length,
      subscribedDevices: withSchedule.reduce((n, u) => n + (u.subscribedCount || 0), 0),
    },
  });
}
