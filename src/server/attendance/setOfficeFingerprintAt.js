import db from "@/server/db";
import { parseAttendanceDateOnly } from "@/server/attendance/buildLoginAttendanceReport";
import { syncAttendanceScoringForDay } from "@/server/attendance/syncAttendanceScoring";

/**
 * Admin-recorded office door fingerprint time for a calendar day.
 */
export async function setOfficeFingerprintAt(targetUserId, calendarDate, officeFingerprintAt) {
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    throw new Error("Invalid userId");
  }

  const date = parseAttendanceDateOnly(calendarDate);
  if (!date) {
    throw new Error("Invalid calendarDate (use YYYY-MM-DD)");
  }

  let at = null;
  if (officeFingerprintAt != null && officeFingerprintAt !== "") {
    at = new Date(officeFingerprintAt);
    if (Number.isNaN(at.getTime())) {
      throw new Error("Invalid officeFingerprintAt");
    }
  }

  const targetUser = await db.User.findByPk(targetUserId, {
    attributes: ["id", "isActive"],
  });
  if (!targetUser || targetUser.isActive === false) {
    throw new Error("User not found");
  }

  const [record] = await db.AttendanceDailyRecord.findOrCreate({
    where: { userId: targetUserId, calendarDate: date },
    defaults: {
      userId: targetUserId,
      calendarDate: date,
      status: "absent",
      tierKey: "none",
      pointPercent: 0,
      pointsEarned: 0,
      loginCount: 0,
    },
  });

  await record.update({ officeFingerprintAt: at });
  await syncAttendanceScoringForDay(targetUserId, date);
  await record.reload();

  return {
    userId: targetUserId,
    calendarDate: date,
    officeFingerprintAt: record.officeFingerprintAt,
    status: record.status,
    tierKey: record.tierKey,
    pointPercent: record.pointPercent,
    pointsEarned: record.pointsEarned,
  };
}
