import { Op } from "sequelize";
import db from "@/server/db";
import { getSessionCalendarDate } from "@/server/auth/loginWindow";
import { getCurrentApprovedLeaveForUser } from "@/server/leave/userLeave";
import {
  STREAK_BONUSES,
  isStreakQualifyingTier,
} from "@/server/attendance/gamificationRules";
import {
  evaluateLoginAttendance,
  isAttendanceExempt,
} from "@/server/attendance/lateStatus";
import {
  listCalendarDates,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";

export function getScoringTimestamp(record) {
  if (!record) return null;
  if (record.officeFingerprintAt) return new Date(record.officeFingerprintAt);
  if (record.firstLoginAt) return new Date(record.firstLoginAt);
  return null;
}

export function evaluateRecordAttendance(user, record) {
  const at = getScoringTimestamp(record);
  if (!at) return null;
  return evaluateLoginAttendance(user, at);
}

async function deleteDayPointLogs(userId, calendarDate) {
  await db.AttendancePointLog.destroy({
    where: { userId, calendarDate },
  });
}

async function getOrCreateStats(userId) {
  let row = await db.UserAttendanceStats.findOne({ where: { userId } });
  if (!row) {
    row = await db.UserAttendanceStats.create({
      userId,
      totalPoints: 0,
      currentOnTimeStreak: 0,
      longestOnTimeStreak: 0,
    });
  }
  return row;
}

export async function rebuildUserAttendanceStats(userId) {
  const user = await db.User.findByPk(userId, {
    attributes: ["id", "role", "shiftKey", "isOutside"],
  });
  if (!user) return;

  const records = await db.AttendanceDailyRecord.findAll({
    where: { userId },
    order: [["calendarDate", "ASC"]],
  });
  if (records.length === 0) {
    const totalPoints = await db.AttendancePointLog.sum("points", { where: { userId } });
    const stats = await getOrCreateStats(userId);
    await stats.update({
      totalPoints: totalPoints ?? 0,
      currentOnTimeStreak: 0,
      longestOnTimeStreak: 0,
      lastProcessedDate: null,
    });
    return;
  }

  const firstDate = records[0].calendarDate;
  const today = getSessionCalendarDate(new Date(), user);
  const endDate = today > records[records.length - 1].calendarDate
    ? today
    : records[records.length - 1].calendarDate;
  const dates = listCalendarDates(firstDate, endDate);

  const leaves = await db.LeaveApplication.findAll({
    where: {
      userId,
      status: "approved",
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: firstDate },
    },
    attributes: ["startDate", "endDate"],
  });

  const leaveDates = new Set();
  for (const leave of leaves) {
    for (const dateStr of dates) {
      if (leave.startDate <= dateStr && leave.endDate >= dateStr) leaveDates.add(dateStr);
    }
  }

  const exemptDates = new Set();
  for (const dateStr of dates) {
    const probe = new Date(`${dateStr}T12:00:00.000Z`);
    if (isAttendanceExempt(user, probe)) exemptDates.add(dateStr);
  }

  const recordByDate = new Map(records.map((r) => [r.calendarDate, r]));

  let streak = 0;
  let longest = 0;
  let lastProcessedDate = null;

  for (const dateStr of dates) {
    if (leaveDates.has(dateStr) || exemptDates.has(dateStr)) {
      continue;
    }

    const record = recordByDate.get(dateStr);
    const scoringAt = record ? getScoringTimestamp(record) : null;
    if (!scoringAt) {
      streak = 0;
      lastProcessedDate = dateStr;
      continue;
    }

    const evaluation = evaluateRecordAttendance(user, record);
    if (!evaluation || evaluation.exempt) {
      continue;
    }

    if (isStreakQualifyingTier(evaluation.tierKey)) {
      streak += 1;
      longest = Math.max(longest, streak);
    } else {
      streak = 0;
    }
    lastProcessedDate = dateStr;
  }

  const totalPoints = await db.AttendancePointLog.sum("points", { where: { userId } });
  const stats = await getOrCreateStats(userId);

  await stats.update({
    totalPoints: totalPoints ?? 0,
    currentOnTimeStreak: streak,
    longestOnTimeStreak: Math.max(stats.longestOnTimeStreak ?? 0, longest),
    lastProcessedDate,
  });
}

/**
 * Re-score one day from office fingerprint (if set) or app first login.
 */
export async function syncAttendanceScoringForDay(userId, calendarDate) {
  const date = parseAttendanceDateOnly(calendarDate);
  if (!date) {
    throw new Error("Invalid calendarDate");
  }

  const user = await db.User.findByPk(userId, {
    attributes: ["id", "username", "role", "shiftKey", "isOutside", "isActive"],
  });
  if (!user || user.isActive === false) {
    throw new Error("User not found");
  }

  const probe = new Date(`${date}T12:00:00.000Z`);
  const leave = await getCurrentApprovedLeaveForUser(userId, probe);
  if (leave && user.role !== "admin") {
    await deleteDayPointLogs(userId, date);
    const record = await db.AttendanceDailyRecord.findOne({
      where: { userId, calendarDate: date },
    });
    if (record) {
      await record.update({
        pointsEarned: 0,
        tierKey: null,
        pointPercent: null,
        minutesAfterStart: null,
      });
    }
    await rebuildUserAttendanceStats(userId);
    return;
  }

  const record = await db.AttendanceDailyRecord.findOne({
    where: { userId, calendarDate: date },
  });
  if (!record) {
    await rebuildUserAttendanceStats(userId);
    return;
  }

  if (isAttendanceExempt(user, probe)) {
    await deleteDayPointLogs(userId, date);
    await record.update({
      status: "exempt",
      tierKey: null,
      pointPercent: null,
      pointsEarned: 0,
      minutesAfterStart: null,
    });
    await rebuildUserAttendanceStats(userId);
    return;
  }

  const scoringAt = getScoringTimestamp(record);
  if (!scoringAt) {
    await deleteDayPointLogs(userId, date);
    await record.update({
      status: "absent",
      tierKey: "none",
      pointPercent: 0,
      pointsEarned: 0,
      minutesAfterStart: null,
    });
    await rebuildUserAttendanceStats(userId);
    return;
  }

  const evaluation = evaluateRecordAttendance(user, record);
  if (!evaluation || evaluation.exempt) {
    await deleteDayPointLogs(userId, date);
    await rebuildUserAttendanceStats(userId);
    return;
  }

  await record.update({
    status: "present",
    tierKey: evaluation.tierKey,
    pointPercent: evaluation.pointPercent,
    minutesAfterStart: evaluation.minutesAfterStart,
  });

  await deleteDayPointLogs(userId, date);

  await db.AttendancePointLog.create({
    userId,
    calendarDate: date,
    points: evaluation.pointsEarned,
    pointPercent: evaluation.pointPercent,
    reason: `daily_${evaluation.tierKey}`,
    tierKey: evaluation.tierKey,
  });

  await rebuildUserAttendanceStats(userId);

  const streakAfter = await db.UserAttendanceStats.findOne({
    where: { userId },
    attributes: ["currentOnTimeStreak"],
  });
  const newStreak = streakAfter?.currentOnTimeStreak ?? 0;

  if (isStreakQualifyingTier(evaluation.tierKey)) {
    for (const bonus of STREAK_BONUSES) {
      if (newStreak === bonus.days) {
        try {
          await db.AttendancePointLog.create({
            userId,
            calendarDate: date,
            points: bonus.points,
            pointPercent: 100,
            reason: bonus.reason,
            tierKey: evaluation.tierKey,
          });
        } catch {
          /* duplicate */
        }
      }
    }
  }

  const totalDayPoints = await db.AttendancePointLog.sum("points", {
    where: { userId, calendarDate: date },
  });

  await record.update({ pointsEarned: totalDayPoints ?? evaluation.pointsEarned });
  await rebuildUserAttendanceStats(userId);
}
