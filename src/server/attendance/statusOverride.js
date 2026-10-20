import db from "@/server/db";
import { parseAttendanceDateOnly } from "@/server/attendance/buildLoginAttendanceReport";

/** Values admins/managers may set as attendance day status override. */
export const ATTENDANCE_STATUS_OVERRIDE_VALUES = ["present", "absent", "on_leave", "half_leave"];

export function normalizeStatusOverride(value) {
  if (value == null || value === "" || value === "auto" || value === "clear") {
    return null;
  }
  const v = String(value).trim();
  if (!ATTENDANCE_STATUS_OVERRIDE_VALUES.includes(v)) {
    throw new Error(
      `statusOverride must be one of: ${ATTENDANCE_STATUS_OVERRIDE_VALUES.join(", ")}, or null to clear`,
    );
  }
  return v;
}

/**
 * Persist admin/manager status override for a calendar day.
 * Does not change points/scoring — report layer reads statusOverride.
 */
export async function setAttendanceStatusOverride(targetUserId, calendarDate, statusOverride) {
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    throw new Error("Invalid userId");
  }

  const date = parseAttendanceDateOnly(calendarDate);
  if (!date) {
    throw new Error("Invalid calendarDate (use YYYY-MM-DD)");
  }

  const override = normalizeStatusOverride(statusOverride);

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
      status: override === "absent" ? "absent" : "present",
      tierKey: "none",
      pointPercent: 0,
      pointsEarned: 0,
      loginCount: 0,
      statusOverride: override,
    },
  });

  await record.update({ statusOverride: override });
  await record.reload();

  return {
    userId: targetUserId,
    calendarDate: date,
    statusOverride: record.statusOverride ?? null,
  };
}
