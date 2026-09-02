import { Op } from "sequelize";
import db from "@/server/db";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";
import { formatLocationLabel } from "@/server/activity/resolveRequestLocation";
import {
  deviceLabelForType,
  resolveDeviceTypeFromUserAgent,
} from "@/server/activity/resolveDeviceType";
import {
  getSessionCalendarDate,
  isOutsideManager,
  isShiftWindowEnforced,
  resolveShiftKey,
} from "@/server/auth/loginWindow";
import { getShiftSettings } from "@/server/auth/shiftSettings";
import { buildTierDeadlines } from "@/server/attendance/lateStatus";
import { parseHhmm } from "@/lib/shiftTime.cjs";
import {
  getWeekdayInTimezone,
  normalizeLeaveDays,
} from "@/server/auth/shiftSettingsStore.cjs";

const LOGIN_ACTIONS = ["login_success", "leave_application_login"];
const MAX_RANGE_DAYS = 62;

const LOGIN_ACTIVITY_ATTRIBUTES = [
  "id",
  "userId",
  "action",
  "createdAt",
  "ipAddress",
  "country",
  "region",
  "city",
  "userAgent",
  "deviceType",
];

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function listCalendarDates(fromDate, toDate) {
  const dates = [];
  const start = new Date(`${fromDate}T12:00:00.000Z`);
  const end = new Date(`${toDate}T12:00:00.000Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function assertRangeLimit(from, to) {
  const dates = listCalendarDates(from, to);
  if (dates.length > MAX_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return dates;
}

function buildUserAttendanceContext(user, dates) {
  const alwaysExempt =
    user.role === "admin" || isOutsideManager(user) || !isShiftWindowEnforced(user);
  const settings = getShiftSettings(resolveShiftKey(user));
  const timeZone = settings.timezone || "Asia/Karachi";
  const leaveWeekdays = normalizeLeaveDays(settings.leaveDays);
  const exemptDates = new Set();

  if (alwaysExempt) {
    for (const dateStr of dates) exemptDates.add(dateStr);
  } else {
    for (const dateStr of dates) {
      const probe = new Date(`${dateStr}T12:00:00.000Z`);
      const weekday = getWeekdayInTimezone(probe, timeZone);
      if (leaveWeekdays.includes(weekday)) exemptDates.add(dateStr);
    }
  }

  const tierLegend = buildTierDeadlines(user);

  return {
    exemptDates,
    shiftStartLabel: tierLegend.shiftStartLabel,
    tierDeadlines: tierLegend.tierDeadlines,
  };
}

function indexLoginsByUserAndDate(logins, users) {
  const userById = new Map(users.map((u) => [u.id, u]));
  const index = new Map();

  for (const row of logins) {
    const user = userById.get(row.userId);
    if (!user) continue;
    const dateStr = getSessionCalendarDate(new Date(row.createdAt), user);
    const key = `${row.userId}|${dateStr}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }

  return index;
}

function indexLeaveDates(allLeaves, dates) {
  const byUser = new Map();
  for (const leave of allLeaves) {
    if (!byUser.has(leave.userId)) byUser.set(leave.userId, new Set());
    const set = byUser.get(leave.userId);
    for (const dateStr of dates) {
      if (leave.startDate <= dateStr && leave.endDate >= dateStr) set.add(dateStr);
    }
  }
  return byUser;
}

function serializeLogins(rows) {
  return rows.map((row) => {
    const device = row.deviceType
      ? { deviceType: row.deviceType, deviceLabel: deviceLabelForType(row.deviceType) }
      : resolveDeviceTypeFromUserAgent(row.userAgent);
    return {
      id: row.id,
      action: row.action,
      createdAt: row.createdAt,
      location: formatLocationLabel(row),
      deviceType: device.deviceType,
      deviceLabel: device.deviceLabel,
    };
  });
}

function summarizeDays(days) {
  let daysFullPoints = 0;
  let daysTier90 = 0;
  let daysPartialPoints = 0;
  let daysZeroPoints = 0;
  let daysAbsent = 0;
  let daysOnLeave = 0;
  let daysExempt = 0;
  let totalLogins = 0;

  for (const day of days) {
    totalLogins += day.loginCount ?? 0;
    if (day.status === "on_leave") daysOnLeave += 1;
    else if (day.status === "exempt") daysExempt += 1;
    else if (day.status === "absent") daysAbsent += 1;
    else if (day.tierKey === "full") daysFullPoints += 1;
    else if (day.tierKey === "tier_90") daysTier90 += 1;
    else if (day.tierKey === "none" || day.pointPercent === 0) daysZeroPoints += 1;
    else daysPartialPoints += 1;
  }

  const anchorDay = days.length > 0 ? days[days.length - 1] : null;

  return {
    daysFullPoints,
    daysTier90,
    daysPartialPoints,
    daysZeroPoints,
    daysAbsent,
    daysOnLeave,
    daysExempt,
    totalLogins,
    daysOnTime: daysFullPoints + daysTier90,
    firstLoginAt: anchorDay?.firstLoginAt ?? null,
    firstLoginDeviceLabel: anchorDay?.firstLoginDeviceLabel ?? null,
  };
}

function officeFingerprintField(record) {
  return { officeFingerprintAt: record?.officeFingerprintAt ?? null };
}

function buildDayRow(
  dateStr,
  ctx,
  record,
  onLeave,
  exempt,
  includeDays,
  includeLogins,
  dayLogins,
) {
  if (onLeave) {
    const row = {
      date: dateStr,
      status: "on_leave",
      tierKey: null,
      pointPercent: null,
      pointsEarned: 0,
      loginCount: record?.loginCount ?? 0,
      firstLoginAt: record?.firstLoginAt ?? null,
      lastLoginAt: record?.lastLoginAt ?? null,
      minutesAfterStart: null,
      ...officeFingerprintField(record),
    };
    if (!includeDays) return row;
    return {
      ...row,
      shiftStartLabel: null,
      tierDeadlines: null,
      logins: includeLogins ? serializeLogins(dayLogins) : [],
    };
  }

  if (exempt) {
    const row = {
      date: dateStr,
      status: "exempt",
      tierKey: null,
      pointPercent: null,
      pointsEarned: 0,
      loginCount: record?.loginCount ?? 0,
      firstLoginAt: record?.firstLoginAt ?? null,
      lastLoginAt: record?.lastLoginAt ?? null,
      minutesAfterStart: null,
      ...officeFingerprintField(record),
    };
    if (!includeDays) return row;
    return {
      ...row,
      shiftStartLabel: null,
      tierDeadlines: null,
      logins: includeLogins ? serializeLogins(dayLogins) : [],
    };
  }

  if (record) {
    const row = {
      date: dateStr,
      status: record.status,
      tierKey: record.tierKey,
      pointPercent: record.pointPercent,
      pointsEarned: record.pointsEarned,
      loginCount: record.loginCount,
      firstLoginAt: record.firstLoginAt,
      lastLoginAt: record.lastLoginAt,
      minutesAfterStart: record.minutesAfterStart,
      firstLoginDevice: record.firstLoginDevice ?? null,
      firstLoginDeviceLabel: deviceLabelForType(record.firstLoginDevice),
      lastLoginDevice: record.lastLoginDevice ?? null,
      lastLoginDeviceLabel: deviceLabelForType(record.lastLoginDevice),
      ...officeFingerprintField(record),
    };
    if (!includeDays) return row;
    return {
      ...row,
      shiftStartLabel: ctx.shiftStartLabel,
      tierDeadlines: ctx.tierDeadlines,
      logins: includeLogins ? serializeLogins(dayLogins) : [],
    };
  }

  const absent = {
    date: dateStr,
    status: "absent",
    tierKey: "none",
    pointPercent: 0,
    pointsEarned: 0,
    loginCount: 0,
    firstLoginAt: null,
    lastLoginAt: null,
    minutesAfterStart: null,
    officeFingerprintAt: null,
  };
  if (!includeDays) return absent;
  return {
    ...absent,
    shiftStartLabel: ctx.shiftStartLabel,
    tierDeadlines: ctx.tierDeadlines,
    logins: [],
  };
}

async function resolveUserIds(userIds, allActiveUsers) {
  if (userIds?.length) return userIds;
  if (!allActiveUsers) return [];

  const rows = await db.User.findAll({
    where: { isActive: { [Op.ne]: false } },
    attributes: ["id"],
    order: [["username", "ASC"]],
  });
  return rows.map((r) => r.id);
}

async function buildReportFromDailyRecords(
  users,
  from,
  to,
  dates,
  includeDays,
  includeLogins,
) {
  const activeIds = users.map((u) => u.id);

  const [dailyRows, allLeaves, statsRows] = await Promise.all([
    db.AttendanceDailyRecord.findAll({
      where: {
        userId: { [Op.in]: activeIds },
        calendarDate: { [Op.between]: [from, to] },
      },
    }),
    db.LeaveApplication.findAll({
      where: {
        userId: { [Op.in]: activeIds },
        status: "approved",
        startDate: { [Op.lte]: to },
        endDate: { [Op.gte]: from },
      },
      attributes: ["userId", "startDate", "endDate"],
    }),
    db.UserAttendanceStats.findAll({
      where: { userId: { [Op.in]: activeIds } },
    }),
  ]);

  const dailyByKey = new Map(
    dailyRows.map((r) => [`${r.userId}|${r.calendarDate}`, r]),
  );
  const leaveDatesByUser = indexLeaveDates(allLeaves, dates);
  const statsByUser = new Map(statsRows.map((r) => [r.userId, r]));
  const userContext = new Map(
    users.map((u) => [u.id, buildUserAttendanceContext(u, dates)]),
  );

  let loginIndex = null;
  if (includeLogins) {
    const logins = await db.UserActivity.findAll({
      where: {
        userId: { [Op.in]: activeIds },
        action: { [Op.in]: LOGIN_ACTIONS },
        ...dateRangeWhere(from, to),
      },
      attributes: LOGIN_ACTIVITY_ATTRIBUTES,
      order: [["createdAt", "ASC"]],
    });
    loginIndex = indexLoginsByUserAndDate(logins, users);
  }

  return users.map((user) => {
    const ctx = userContext.get(user.id);
    const leaveDates = leaveDatesByUser.get(user.id) ?? new Set();

    const dayStats = dates.map((dateStr) => {
      const key = `${user.id}|${dateStr}`;
      const record = dailyByKey.get(key);
      const dayLogins = loginIndex?.get(key) ?? [];
      return buildDayRow(
        dateStr,
        ctx,
        record,
        leaveDates.has(dateStr),
        ctx.exemptDates.has(dateStr),
        includeDays,
        includeLogins,
        dayLogins,
      );
    });

    const summary = summarizeDays(dayStats);
    const stats = statsByUser.get(user.id);

    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      shiftKey: user.shiftKey,
      isOutside: user.isOutside,
      days: includeDays ? dayStats : undefined,
      summary: {
        ...summary,
        totalPoints: stats?.totalPoints ?? 0,
        currentStreak: stats?.currentOnTimeStreak ?? 0,
        longestStreak: stats?.longestOnTimeStreak ?? 0,
      },
    };
  });
}

/** Login detail for a calendar day (UserActivity; includes mobile/tablet not in daily record). */
export async function loadDayLoginsForUser(userId, calendarDate) {
  const date = parseDateOnly(calendarDate);
  if (!date) return [];

  const logins = await db.UserActivity.findAll({
    where: {
      userId,
      action: { [Op.in]: LOGIN_ACTIONS },
      ...dateRangeWhere(date, date),
    },
    attributes: LOGIN_ACTIVITY_ATTRIBUTES,
    order: [["createdAt", "ASC"]],
  });

  return serializeLogins(logins);
}

/**
 * Attendance from AttendanceDailyRecords only (written on each login). No UserActivity backfill.
 */
export async function buildLoginAttendanceReport(userIds, fromDate, toDate, options = {}) {
  const includeDays = options.includeDays !== false;
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  if (!from || !to || from > to) {
    throw new Error("Invalid date range");
  }

  const dates = assertRangeLimit(from, to);
  const ids = await resolveUserIds(userIds, options.allActiveUsers);
  if (ids.length === 0) {
    return { fromDate: from, toDate: to, users: [] };
  }

  const users = await db.User.findAll({
    where: { id: { [Op.in]: ids }, isActive: { [Op.ne]: false } },
    attributes: ["id", "username", "role", "shiftKey", "isOutside"],
  });

  if (users.length === 0) {
    return { fromDate: from, toDate: to, users: [] };
  }

  try {
    const reports = await buildReportFromDailyRecords(
      users,
      from,
      to,
      dates,
      includeDays,
      options.includeLogins === true,
    );
    return { fromDate: from, toDate: to, users: reports };
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes("AttendanceDailyRecords") || msg.includes("doesn't exist")) {
      throw new Error(
        "Attendance tables are missing. Run database migrations (20260831180000-create-attendance-daily-records).",
      );
    }
    throw err;
  }
}

export { parseDateOnly as parseAttendanceDateOnly, MAX_RANGE_DAYS, listCalendarDates };
