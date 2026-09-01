import db from "@/server/db";
import { getSessionCalendarDate } from "@/server/auth/loginWindow";
import { getCurrentApprovedLeaveForUser } from "@/server/leave/userLeave";
import { evaluateLoginAttendance } from "@/server/attendance/lateStatus";

function firstLoginDeviceFields(device) {
  if (!device?.deviceType || device.deviceType === "unknown") return {};
  return { firstLoginDevice: device.deviceType };
}

function lastLoginDeviceFields(device) {
  if (!device?.deviceType || device.deviceType === "unknown") return {};
  return { lastLoginDevice: device.deviceType };
}

/**
 * Upsert cached daily row on each login_success (fast reads for /api/attendance).
 */
export async function upsertDailyLoginRecord(user, loginAt = new Date(), device = null) {
  if (!user?.id) return;

  const leave = await getCurrentApprovedLeaveForUser(user.id, loginAt);
  if (leave && user.role !== "admin") {
    const calendarDate = getSessionCalendarDate(loginAt, user);
    const existing = await db.AttendanceDailyRecord.findOne({
      where: { userId: user.id, calendarDate },
    });
    if (existing) {
      await existing.update({
        status: "on_leave",
        loginCount: existing.loginCount + 1,
        lastLoginAt: loginAt,
        firstLoginAt: existing.firstLoginAt ?? loginAt,
        ...lastLoginDeviceFields(device),
      });
    } else {
      await db.AttendanceDailyRecord.create({
        userId: user.id,
        calendarDate,
        status: "on_leave",
        tierKey: null,
        pointPercent: null,
        pointsEarned: 0,
        firstLoginAt: loginAt,
        lastLoginAt: loginAt,
        loginCount: 1,
        minutesAfterStart: null,
        ...firstLoginDeviceFields(device),
        ...lastLoginDeviceFields(device),
      });
    }
    return;
  }

  const evaluation = evaluateLoginAttendance(user, loginAt);
  const calendarDate = evaluation.calendarDate;

  const existing = await db.AttendanceDailyRecord.findOne({
    where: { userId: user.id, calendarDate },
  });

  if (evaluation.exempt) {
    if (existing) {
      await existing.update({
        status: "exempt",
        loginCount: existing.loginCount + 1,
        lastLoginAt: loginAt,
        firstLoginAt: existing.firstLoginAt ?? loginAt,
        ...lastLoginDeviceFields(device),
      });
    } else {
      await db.AttendanceDailyRecord.create({
        userId: user.id,
        calendarDate,
        status: "exempt",
        tierKey: null,
        pointPercent: null,
        pointsEarned: 0,
        firstLoginAt: loginAt,
        lastLoginAt: loginAt,
        loginCount: 1,
        minutesAfterStart: null,
        ...firstLoginDeviceFields(device),
        ...lastLoginDeviceFields(device),
      });
    }
    return;
  }

  if (existing) {
    await existing.update({
      loginCount: existing.loginCount + 1,
      lastLoginAt: loginAt,
      firstLoginAt: existing.firstLoginAt ?? loginAt,
      ...lastLoginDeviceFields(device),
    });
    return;
  }

  await db.AttendanceDailyRecord.create({
    userId: user.id,
    calendarDate,
    status: "present",
    tierKey: evaluation.tierKey,
    pointPercent: evaluation.pointPercent,
    pointsEarned: evaluation.pointsEarned,
    firstLoginAt: loginAt,
    lastLoginAt: loginAt,
    loginCount: 1,
    minutesAfterStart: evaluation.minutesAfterStart,
    ...firstLoginDeviceFields(device),
    ...lastLoginDeviceFields(device),
  });
}

export async function syncDailyRecordPoints(userId, calendarDate, pointsEarned) {
  const row = await db.AttendanceDailyRecord.findOne({
    where: { userId, calendarDate },
  });
  if (row) {
    await row.update({ pointsEarned });
  }
}
