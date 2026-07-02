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
};

function applyShiftSettings(next) {
  if (!next || typeof next !== "object") return { ...cached };

  cached = {
    enabled: readShiftEnabled(next.enabled, envDefaultEnabled()),
    startUtc: trimHhmm(next.startUtc, DEFAULT_START_UTC),
    endUtc: trimHhmm(next.endUtc, DEFAULT_END_UTC),
    timezone: envOrDefault(next.timezone, DEFAULT_TIMEZONE),
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
  applyShiftSettings,
  getShiftSettings,
  getShiftWindowLabel: getShiftWindowLabelFromSettings,
  parseUtcTimeOfDay: parseHhmm,
  readShiftEnabled,
  formatHhmmInTimezone,
  getTimezoneLabel,
};
