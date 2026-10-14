import db from "@/server/db";

const DEFAULT_TIMEZONE = "Asia/Karachi";
const DEFAULT_ALLOW_DAYS = [1, 2, 3, 4, 5];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Dubai", label: "UAE (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Europe/London", label: "UK (GMT/BST)" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "UTC", label: "UTC" },
];

function parseHhmm(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function normalizeHhmm(value, fallback) {
  const mins = parseHhmm(value);
  if (mins == null) return fallback;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeAllowDays(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_ALLOW_DAYS];
  const days = [
    ...new Set(raw.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ];
  days.sort((a, b) => a - b);
  return days.length ? days : [...DEFAULT_ALLOW_DAYS];
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[weekdayShort] ?? null;
  if (weekday == null || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { weekday, minutes: hour * 60 + minute };
}

/** True when local time is inside the allow window (supports overnight). */
export function isWithinAllowWindow(settings, now = new Date()) {
  if (!settings?.scheduleEnabled) return true;

  const timeZone = settings.timezone || DEFAULT_TIMEZONE;
  const start = parseHhmm(settings.allowStartLocal);
  const end = parseHhmm(settings.allowEndLocal);
  const allowDays = normalizeAllowDays(settings.allowDays);
  if (start == null || end == null) return true;

  const local = zonedParts(now, timeZone);
  if (!local) return true;

  const overnight = start > end;

  if (!overnight) {
    if (!allowDays.includes(local.weekday)) return false;
    return local.minutes >= start && local.minutes < end;
  }

  if (local.minutes >= start) return allowDays.includes(local.weekday);
  if (local.minutes < end) {
    const prevDay = (local.weekday + 6) % 7;
    return allowDays.includes(prevDay);
  }
  return false;
}

export function serializeNotificationSchedule(row) {
  const scheduleEnabled = Boolean(row?.scheduleEnabled);
  const timezone = row?.timezone || DEFAULT_TIMEZONE;
  const allowStartLocal = normalizeHhmm(row?.allowStartLocal, "09:00");
  const allowEndLocal = normalizeHhmm(row?.allowEndLocal, "18:00");
  const allowDays = normalizeAllowDays(row?.allowDays);
  const inQuietHours =
    scheduleEnabled &&
    !isWithinAllowWindow({
      scheduleEnabled,
      timezone,
      allowStartLocal,
      allowEndLocal,
      allowDays,
    });

  return {
    scheduleEnabled,
    timezone,
    allowStartLocal,
    allowEndLocal,
    allowDays,
    allowDaysLabels: allowDays.map((d) => WEEKDAY_LABELS[d]),
    inQuietHours,
    timezoneOptions: TIMEZONE_OPTIONS,
    weekdayOptions: WEEKDAY_LABELS.map((label, value) => ({ value, label })),
  };
}

export function defaultNotificationSchedule() {
  return serializeNotificationSchedule(null);
}

export async function getNotificationScheduleForUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return defaultNotificationSchedule();

  try {
    const row = await db.UserNotificationSetting.findOne({ where: { userId: id } });
    return serializeNotificationSchedule(row || null);
  } catch (err) {
    console.warn("[push-schedule] load failed", err?.message || err);
    return defaultNotificationSchedule();
  }
}

export async function isUserInQuietHours(userId, now = new Date()) {
  const schedule = await getNotificationScheduleForUser(userId);
  if (!schedule.scheduleEnabled) return false;
  return !isWithinAllowWindow(schedule, now);
}

export async function upsertNotificationSchedule(userId, input = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Invalid user" };
  }

  const scheduleEnabled = Boolean(input.scheduleEnabled);
  const timezone = TIMEZONE_OPTIONS.some((t) => t.value === input.timezone)
    ? input.timezone
    : DEFAULT_TIMEZONE;
  const allowStartLocal = normalizeHhmm(input.allowStartLocal, "09:00");
  const allowEndLocal = normalizeHhmm(input.allowEndLocal, "18:00");
  const allowDays = normalizeAllowDays(input.allowDays);

  const [row] = await db.UserNotificationSetting.findOrCreate({
    where: { userId: id },
    defaults: {
      userId: id,
      scheduleEnabled,
      timezone,
      allowStartLocal,
      allowEndLocal,
      allowDays,
    },
  });

  await row.update({
    scheduleEnabled,
    timezone,
    allowStartLocal,
    allowEndLocal,
    allowDays,
  });

  return { ok: true, schedule: serializeNotificationSchedule(row) };
}
