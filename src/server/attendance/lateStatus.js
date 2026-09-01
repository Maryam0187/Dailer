import { parseHhmm, utcHhmmToZonedHhmm, formatHhmmInTimezone, zonedMinutesOfDay } from "@/lib/shiftTime.cjs";
import {
  getSessionCalendarDate,
  isLeaveDay,
  isOutsideManager,
  isShiftWindowEnforced,
  resolveShiftKey,
} from "@/server/auth/loginWindow";
import { getShiftSettings } from "@/server/auth/shiftSettings";
import {
  buildTierDeadlineMinutes,
  resolvePointTier,
  pointsForTier,
} from "@/server/attendance/gamificationRules";

function utcMinutesOfDay(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
}

export function minutesAfterShiftStart(loginAt, user) {
  const settings = getShiftSettings(resolveShiftKey(user));
  const startMinutes = parseHhmm(settings.startUtc);
  return minutesAfterShiftStartCached(loginAt, startMinutes);
}

export function minutesAfterShiftStartCached(loginAt, startMinutes) {
  if (startMinutes == null) return null;
  const loginMinutes = utcMinutesOfDay(loginAt);
  return loginMinutes - startMinutes;
}

function formatZonedDeadlineLabel(timeZone, minutesAfterStart) {
  const targetZonedMin = minutesAfterStart % (24 * 60);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  for (let utcH = 0; utcH < 24; utcH += 1) {
    for (let utcM = 0; utcM < 60; utcM += 1) {
      const probe = new Date(Date.UTC(2026, 5, 15, utcH, utcM));
      const zonedMin = zonedMinutesOfDay(probe, timeZone);
      if (zonedMin === targetZonedMin) {
        return formatter.format(probe);
      }
    }
  }
  return null;
}

function formatZonedDeadlineFromShiftStart(startUtc, timeZone, minutesAfterStart) {
  const startZoned = utcHhmmToZonedHhmm(startUtc, timeZone);
  const startMin = parseHhmm(startZoned);
  if (startMin == null) return formatHhmmInTimezone(startUtc, timeZone);
  const deadlineZonedMin = (startMin + minutesAfterStart) % (24 * 60);
  return formatZonedDeadlineLabel(timeZone, deadlineZonedMin);
}

const tierLegendCache = new Map();

export function buildTierDeadlines(user) {
  const shiftKey = resolveShiftKey(user);
  if (tierLegendCache.has(shiftKey)) {
    return tierLegendCache.get(shiftKey);
  }

  const settings = getShiftSettings(shiftKey);
  const timeZone = settings.timezone || "Asia/Karachi";
  const shiftStartLabel = formatHhmmInTimezone(settings.startUtc, timeZone);

  const tierDeadlines = buildTierDeadlineMinutes().map((row) => ({
    label: formatZonedDeadlineFromShiftStart(settings.startUtc, timeZone, row.minutesAfterStart),
    percent: row.percent,
    minutesAfterStart: row.minutesAfterStart,
  }));

  const legend = { shiftStartLabel, timeZone, tierDeadlines };
  tierLegendCache.set(shiftKey, legend);
  return legend;
}

export function isAttendanceExempt(user, date = new Date()) {
  if (!user) return true;
  if (user.role === "admin" || isOutsideManager(user)) return true;
  if (!isShiftWindowEnforced(user)) return true;
  if (isLeaveDay(date, user)) return true;
  return false;
}

export function evaluateLoginAttendance(user, loginAt = new Date()) {
  if (isAttendanceExempt(user, loginAt)) {
    return {
      exempt: true,
      status: "exempt",
      tierKey: null,
      pointPercent: null,
      pointsEarned: 0,
      minutesAfterStart: null,
      calendarDate: getSessionCalendarDate(loginAt, user),
      ...buildTierDeadlines(user),
    };
  }

  const minutesAfterStart = minutesAfterShiftStart(loginAt, user);
  const tier = resolvePointTier(minutesAfterStart);
  const pointsEarned = pointsForTier(tier.percent);
  const deadlines = buildTierDeadlines(user);

  return {
    exempt: false,
    status: "present",
    tierKey: tier.tierKey,
    pointPercent: tier.percent,
    pointsEarned,
    minutesAfterStart:
      minutesAfterStart != null ? Math.round(minutesAfterStart) : null,
    calendarDate: getSessionCalendarDate(loginAt, user),
    shiftStartLabel: deadlines.shiftStartLabel,
    tierDeadlines: deadlines.tierDeadlines,
    timeZone: deadlines.timeZone,
  };
}
