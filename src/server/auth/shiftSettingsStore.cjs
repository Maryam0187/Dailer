"use strict";

const {
  formatHhmmInTimezone,
  getShiftWindowLabel,
  getTimezoneLabel,
  normalizeHhmm,
  parseHhmm,
} = require("../../lib/shiftTime.cjs");

const DEFAULT_START_UTC = "13:00";
const DEFAULT_END_UTC = "18:00";
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

let cached = {
  enabled: envDefaultEnabled(),
  startUtc: trimHhmm(process.env.LOGIN_WINDOW_START_UTC, DEFAULT_START_UTC),
  endUtc: trimHhmm(process.env.LOGIN_WINDOW_END_UTC, DEFAULT_END_UTC),
  timezone: DEFAULT_TIMEZONE,
  leaveDays: [...DEFAULT_LEAVE_DAYS],
  manuallyActive: true,
};

function applyShiftSettings(next) {
  if (!next || typeof next !== "object") return { ...cached };

  cached = {
    enabled: readShiftEnabled(next.enabled, envDefaultEnabled()),
    startUtc: trimHhmm(next.startUtc, DEFAULT_START_UTC),
    endUtc: trimHhmm(next.endUtc, DEFAULT_END_UTC),
    timezone: envOrDefault(next.timezone, DEFAULT_TIMEZONE),
    leaveDays: normalizeLeaveDays(next.leaveDays, DEFAULT_LEAVE_DAYS),
    manuallyActive: readShiftEnabled(next.manuallyActive, true),
  };

  return { ...cached };
}

function getShiftSettings() {
  return { ...cached };
}

function getShiftWindowLabelFromSettings(settings = getShiftSettings()) {
  return getShiftWindowLabel(settings.startUtc, settings.endUtc, settings.timezone);
}

module.exports = {
  DEFAULT_START_UTC,
  DEFAULT_END_UTC,
  DEFAULT_TIMEZONE,
  DEFAULT_LEAVE_DAYS,
  WEEKDAY_LABELS,
  applyShiftSettings,
  getShiftSettings,
  getShiftWindowLabel: getShiftWindowLabelFromSettings,
  parseUtcTimeOfDay: parseHhmm,
  readShiftEnabled,
  formatHhmmInTimezone,
  getTimezoneLabel,
  normalizeLeaveDays,
  getWeekdayInTimezone,
  formatLeaveDaysLabel,
};
