"use strict";

const {
  formatHhmmInTimezone,
  getShiftWindowLabel,
  getTimezoneLabel,
  normalizeHhmm,
  parseHhmm,
} = require("../../lib/shiftTime.cjs");

const SHIFT_KEYS = ["day", "night"];
const DEFAULT_SHIFT_KEY = "day";

const SHIFT_DEFAULTS = {
  day: {
    key: "day",
    name: "Day",
    // 6:00 PM – 11:00 PM Asia/Karachi
    startUtc: "13:00",
    endUtc: "18:00",
    timezone: "Asia/Karachi",
  },
  night: {
    key: "night",
    name: "Night",
    // 1:00 AM – 6:00 AM Asia/Karachi (UTC wraps midnight)
    startUtc: "20:00",
    endUtc: "01:00",
    timezone: "Asia/Karachi",
  },
};

const DEFAULT_START_UTC = SHIFT_DEFAULTS.day.startUtc;
const DEFAULT_END_UTC = SHIFT_DEFAULTS.day.endUtc;
const DEFAULT_TIMEZONE = "Asia/Karachi";
const DEFAULT_LEAVE_DAYS = [0];

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function normalizeLeaveDays(value, defaultValue = DEFAULT_LEAVE_DAYS) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [...defaultValue];
    }
  }
  if (!Array.isArray(raw)) return [...defaultValue];

  const days = raw
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return [...new Set(days)].sort((a, b) => a - b);
}

function getWeekdayInTimezone(date, timeZone) {
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 0;
}

function formatLeaveDaysLabel(leaveDays = DEFAULT_LEAVE_DAYS) {
  const normalized = normalizeLeaveDays(leaveDays);
  if (normalized.length === 0) return "None";
  return normalized.map((day) => WEEKDAY_LABELS[day] || `Day ${day}`).join(", ");
}

function readShiftEnabled(value, defaultValue = true) {
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  return defaultValue;
}

function trimHhmm(value, fallback) {
  return normalizeHhmm(value) || fallback;
}

function envDefaultEnabled() {
  return process.env.LOGIN_WINDOW_ENABLED !== "false";
}

function envOrDefault(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeShiftKey(value, fallback = DEFAULT_SHIFT_KEY) {
  const key = String(value || "").trim().toLowerCase();
  return SHIFT_KEYS.includes(key) ? key : fallback;
}

function buildDefaultShift(key) {
  const base = SHIFT_DEFAULTS[normalizeShiftKey(key)] || SHIFT_DEFAULTS.day;
  return {
    key: base.key,
    name: base.name,
    enabled: envDefaultEnabled(),
    startUtc: base.startUtc,
    endUtc: base.endUtc,
    timezone: base.timezone || DEFAULT_TIMEZONE,
    leaveDays: [...DEFAULT_LEAVE_DAYS],
    manuallyActive: true,
  };
}

function createInitialCache() {
  return {
    day: buildDefaultShift("day"),
    night: buildDefaultShift("night"),
  };
}

let cached = createInitialCache();

function applyOneShiftSettings(key, next) {
  const normalizedKey = normalizeShiftKey(key);
  const defaults = SHIFT_DEFAULTS[normalizedKey] || SHIFT_DEFAULTS.day;
  const prev = cached[normalizedKey] || buildDefaultShift(normalizedKey);

  cached[normalizedKey] = {
    key: normalizedKey,
    name: envOrDefault(next?.name, prev.name || defaults.name),
    enabled: readShiftEnabled(next?.enabled, envDefaultEnabled()),
    startUtc: trimHhmm(next?.startUtc, defaults.startUtc),
    endUtc: trimHhmm(next?.endUtc, defaults.endUtc),
    timezone: envOrDefault(next?.timezone, defaults.timezone || DEFAULT_TIMEZONE),
    leaveDays: normalizeLeaveDays(next?.leaveDays, DEFAULT_LEAVE_DAYS),
    manuallyActive: readShiftEnabled(next?.manuallyActive, true),
  };

  return { ...cached[normalizedKey] };
}

/** Apply one shift, or a map `{ day, night }`, into the in-memory cache. */
function applyShiftSettings(next, maybeKey) {
  if (maybeKey != null || (next && (next.startUtc != null || next.endUtc != null) && !next.day && !next.night)) {
    const key = normalizeShiftKey(maybeKey || next?.key);
    return applyOneShiftSettings(key, next);
  }

  if (!next || typeof next !== "object") {
    return getAllShiftSettings();
  }

  for (const key of SHIFT_KEYS) {
    if (next[key]) applyOneShiftSettings(key, next[key]);
  }
  return getAllShiftSettings();
}

function getShiftSettings(shiftKey = DEFAULT_SHIFT_KEY) {
  const key = normalizeShiftKey(shiftKey);
  return { ...(cached[key] || buildDefaultShift(key)) };
}

function getAllShiftSettings() {
  return {
    day: getShiftSettings("day"),
    night: getShiftSettings("night"),
  };
}

function getShiftWindowLabelFromSettings(settings = getShiftSettings()) {
  return getShiftWindowLabel(settings.startUtc, settings.endUtc, settings.timezone);
}

/** True when `minutes` is inside [start, end], including UTC windows that wrap midnight. */
function isMinutesWithinUtcWindow(minutes, start, end) {
  if (start == null || end == null || minutes == null) return false;
  if (start <= end) return minutes >= start && minutes <= end;
  return minutes >= start || minutes <= end;
}

function minutesUntilUtcWindowEnd(minutes, start, end) {
  if (start == null || end == null || minutes == null) return null;
  const day = 24 * 60;

  if (start <= end) {
    if (minutes < start || minutes > end) return null;
    return end - minutes;
  }

  // Wrap: active from start→midnight and midnight→end
  if (minutes >= start) return day - minutes + end;
  if (minutes <= end) return end - minutes;
  return null;
}

module.exports = {
  SHIFT_KEYS,
  DEFAULT_SHIFT_KEY,
  SHIFT_DEFAULTS,
  DEFAULT_START_UTC,
  DEFAULT_END_UTC,
  DEFAULT_TIMEZONE,
  DEFAULT_LEAVE_DAYS,
  WEEKDAY_LABELS,
  applyShiftSettings,
  getShiftSettings,
  getAllShiftSettings,
  getShiftWindowLabel: getShiftWindowLabelFromSettings,
  parseUtcTimeOfDay: parseHhmm,
  readShiftEnabled,
  formatHhmmInTimezone,
  getTimezoneLabel,
  normalizeLeaveDays,
  getWeekdayInTimezone,
  formatLeaveDaysLabel,
  normalizeShiftKey,
  isMinutesWithinUtcWindow,
  minutesUntilUtcWindowEnd,
};
