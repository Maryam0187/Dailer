import db from "@/server/db";
import { Op } from "sequelize";
import { getCurrentApprovedLeaveForUser } from "@/server/leave/userLeave";
import {
  BADGE_DEFINITIONS,
  STREAK_BONUSES,
  isStreakQualifyingTier,
} from "@/server/attendance/gamificationRules";
import { evaluateLoginAttendance } from "@/server/attendance/lateStatus";

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

async function grantBadge(userId, badgeKey, earnedAt) {
  const existing = await db.UserAttendanceBadge.findOne({
    where: { userId, badgeKey },
  });
  if (existing) return null;

  await db.UserAttendanceBadge.create({
    userId,
    badgeKey,
    earnedAt,
  });
  const def = BADGE_DEFINITIONS.find((b) => b.badgeKey === badgeKey);
  return { badgeKey, label: def?.label ?? badgeKey };
}

async function countQualifyingWeekdaysInWeek(userId, calendarDate, timeZone) {
  const [y, m, d] = calendarDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .format(anchor);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeek);
  const mondayOffset = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
  const monday = new Date(anchor);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);

  const dates = [];
  for (let i = 0; i < 5; i += 1) {
    const dt = new Date(monday);
    dt.setUTCDate(dt.getUTCDate() + i);
    const label = new Intl.DateTimeFormat("en-CA", { timeZone }).format(dt);
    dates.push(label);
  }

  const logs = await db.AttendancePointLog.findAll({
    where: {
      userId,
      calendarDate: { [Op.in]: dates },
      tierKey: { [Op.in]: ["full", "tier_90"] },
    },
    attributes: ["calendarDate"],
  });

  const qualifying = new Set(logs.map((r) => r.calendarDate));
  return dates.every((date) => qualifying.has(date));
}

async function evaluateBadges(userId, tierKey, streak, calendarDate, timeZone, earnedAt) {
  const newBadges = [];

  if (isStreakQualifyingTier(tierKey)) {
    const starter = await grantBadge(userId, "on_time_starter", earnedAt);
    if (starter) newBadges.push(starter);
  }

  for (const def of BADGE_DEFINITIONS) {
    if (def.type === "streak" && def.minStreak != null && streak >= def.minStreak) {
      const badge = await grantBadge(userId, def.badgeKey, earnedAt);
      if (badge) newBadges.push(badge);
    }
  }

  if (await countQualifyingWeekdaysInWeek(userId, calendarDate, timeZone)) {
    const badge = await grantBadge(userId, "perfect_week", earnedAt);
    if (badge) newBadges.push(badge);
  }

  return newBadges;
}

/**
 * Process gamification for the first full login of the calendar day.
 * Returns attendanceResult for API/UI, or null when skipped.
 */
export async function processLoginGamification(user, loginAt = new Date()) {
  if (!user?.id) return null;

  const leave = await getCurrentApprovedLeaveForUser(user.id, loginAt);
  if (leave && user.role !== "admin") {
    return null;
  }

  const evaluation = evaluateLoginAttendance(user, loginAt);
  if (evaluation.exempt) return null;

  const calendarDate = evaluation.calendarDate;

  const dailyWithFingerprint = await db.AttendanceDailyRecord.findOne({
    where: { userId: user.id, calendarDate },
    attributes: ["officeFingerprintAt"],
  });
  if (dailyWithFingerprint?.officeFingerprintAt) {
    return null;
  }

  const stats = await getOrCreateStats(user.id);

  const existingDaily = await db.AttendancePointLog.findOne({
    where: {
      userId: user.id,
      calendarDate,
      reason: { [Op.like]: "daily_%" },
    },
    attributes: ["id"],
  });

  if (existingDaily) {
    return null;
  }

  let streakBroken = false;
  let streakBonus = 0;
  let newStreak = stats.currentOnTimeStreak;

  if (isStreakQualifyingTier(evaluation.tierKey)) {
    newStreak = stats.currentOnTimeStreak + 1;
  } else {
    streakBroken = stats.currentOnTimeStreak > 0;
    newStreak = 0;
  }

  const longest = Math.max(stats.longestOnTimeStreak, newStreak);
  let totalPoints = stats.totalPoints + evaluation.pointsEarned;

  await db.AttendancePointLog.create({
    userId: user.id,
    calendarDate,
    points: evaluation.pointsEarned,
    pointPercent: evaluation.pointPercent,
    reason: `daily_${evaluation.tierKey}`,
    tierKey: evaluation.tierKey,
  });

  for (const bonus of STREAK_BONUSES) {
    if (newStreak === bonus.days && isStreakQualifyingTier(evaluation.tierKey)) {
      try {
        await db.AttendancePointLog.create({
          userId: user.id,
          calendarDate,
          points: bonus.points,
          pointPercent: 100,
          reason: bonus.reason,
          tierKey: evaluation.tierKey,
        });
        streakBonus += bonus.points;
        totalPoints += bonus.points;
      } catch {
        /* duplicate bonus same day */
      }
    }
  }

  await stats.update({
    totalPoints,
    currentOnTimeStreak: newStreak,
    longestOnTimeStreak: longest,
    lastProcessedDate: calendarDate,
  });

  const newBadges = await evaluateBadges(
    user.id,
    evaluation.tierKey,
    newStreak,
    calendarDate,
    evaluation.timeZone,
    loginAt,
  );

  const totalDayPoints = await db.AttendancePointLog.sum("points", {
    where: { userId: user.id, calendarDate },
  });

  await db.AttendanceDailyRecord.update(
    {
      pointsEarned: totalDayPoints ?? evaluation.pointsEarned,
      tierKey: evaluation.tierKey,
      pointPercent: evaluation.pointPercent,
      status: "present",
      minutesAfterStart: evaluation.minutesAfterStart,
    },
    { where: { userId: user.id, calendarDate } },
  );

  return serializeResultFromStats(
    { ...stats.toJSON(), totalPoints, currentOnTimeStreak: newStreak, longestOnTimeStreak: longest },
    evaluation,
    newBadges,
    streakBonus,
    streakBroken,
  );
}

function serializeResultFromStats(stats, evaluation, newBadges, streakBonus, streakBroken) {
  return {
    tierKey: evaluation.tierKey,
    pointPercent: evaluation.pointPercent,
    pointsEarned: evaluation.pointsEarned,
    streakBonus,
    totalPointsAwarded: evaluation.pointsEarned + streakBonus,
    currentStreak: stats.currentOnTimeStreak,
    longestStreak: stats.longestOnTimeStreak,
    totalPoints: stats.totalPoints,
    streakBroken,
    newBadges,
    minutesAfterStart: evaluation.minutesAfterStart,
    shiftStartLabel: evaluation.shiftStartLabel,
    tierDeadlines: evaluation.tierDeadlines,
    calendarDate: evaluation.calendarDate,
  };
}

export async function getGamificationSnapshot(
  userId,
  { fromDate = null, toDate = null } = {},
) {
  const pointWhere = { userId };
  if (fromDate && toDate) {
    pointWhere.calendarDate = { [Op.between]: [fromDate, toDate] };
  }

  const [stats, badges, pointLog, lifetimePoints] = await Promise.all([
    db.UserAttendanceStats.findOne({ where: { userId } }),
    db.UserAttendanceBadge.findAll({
      where: { userId },
      order: [["earnedAt", "DESC"]],
    }),
    db.AttendancePointLog.findAll({
      where: pointWhere,
      order: [["calendarDate", "DESC"], ["id", "DESC"]],
      limit: fromDate && toDate ? 100 : 60,
    }),
    db.AttendancePointLog.sum("points", { where: { userId } }),
  ]);

  const earnedKeys = new Set(badges.map((b) => b.badgeKey));
  const badgeRows = BADGE_DEFINITIONS.map((def) => ({
    badgeKey: def.badgeKey,
    label: def.label,
    earned: earnedKeys.has(def.badgeKey),
    earnedAt: badges.find((b) => b.badgeKey === def.badgeKey)?.earnedAt ?? null,
  }));

  const totalPoints =
    lifetimePoints != null && lifetimePoints > 0
      ? lifetimePoints
      : (stats?.totalPoints ?? 0);

  return {
    totalPoints,
    currentOnTimeStreak: stats?.currentOnTimeStreak ?? 0,
    longestOnTimeStreak: stats?.longestOnTimeStreak ?? 0,
    badges: badgeRows,
    pointLog: pointLog.map((row) => ({
      calendarDate: row.calendarDate,
      points: row.points,
      pointPercent: row.pointPercent,
      reason: row.reason,
      tierKey: row.tierKey,
    })),
  };
}
