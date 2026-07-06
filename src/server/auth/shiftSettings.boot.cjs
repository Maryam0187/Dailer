"use strict";

const db = require("../../../models");
const {
  getShiftWindowLabel,
  utcHhmmToZonedHhmm,
} = require("../../lib/shiftTime.cjs");
const {
  applyShiftSettings,
  DEFAULT_END_UTC,
  DEFAULT_LEAVE_DAYS,
  DEFAULT_START_UTC,
  DEFAULT_TIMEZONE,
  formatLeaveDaysLabel,
  getShiftSettings,
  normalizeLeaveDays,
  parseUtcTimeOfDay,
  readShiftEnabled,
} = require("./shiftSettingsStore.cjs");
const {
  DEFAULT_GRANT_DURATION_MINUTES,
  normalizeGrantDurationMinutes,
} = require("./afterShiftGrant.cjs");

let loadPromise = null;

function envDefaults() {
  return {
    enabled: readShiftEnabled(process.env.LOGIN_WINDOW_ENABLED, true),
    startUtc: String(process.env.LOGIN_WINDOW_START_UTC || DEFAULT_START_UTC).trim() || DEFAULT_START_UTC,
    endUtc: String(process.env.LOGIN_WINDOW_END_UTC || DEFAULT_END_UTC).trim() || DEFAULT_END_UTC,
    timezone: DEFAULT_TIMEZONE,
    leaveDays: [...DEFAULT_LEAVE_DAYS],
    manuallyActive: true,
  };
}

function serializeShiftSettings(row) {
  const settings = row
    ? {
        enabled: readShiftEnabled(row.enabled, true),
        startUtc: row.startUtc,
        endUtc: row.endUtc,
        timezone: row.timezone || DEFAULT_TIMEZONE,
        leaveDays: normalizeLeaveDays(row.leaveDays, DEFAULT_LEAVE_DAYS),
        manuallyActive: readShiftEnabled(row.manuallyActive, true),
      }
    : envDefaults();

  applyShiftSettings(settings);
}

async function loadShiftSettingsFromDb() {
  try {
    let row = await db.ShiftSetting.findOne({ order: [["id", "DESC"]] });
    if (!row) {
      const defaults = envDefaults();
      row = await db.ShiftSetting.create({
        enabled: defaults.enabled,
        startUtc: parseUtcTimeOfDay(defaults.startUtc) != null ? defaults.startUtc : DEFAULT_START_UTC,
        endUtc: parseUtcTimeOfDay(defaults.endUtc) != null ? defaults.endUtc : DEFAULT_END_UTC,
        timezone: defaults.timezone,
        leaveDays: defaults.leaveDays,
        manuallyActive: defaults.manuallyActive,
        afterShiftGrantDurationMinutes: DEFAULT_GRANT_DURATION_MINUTES,
        updatedBy: null,
      });
    }
    serializeShiftSettings(row);
    const applied = getShiftSettings();
    return {
      enabled: applied.enabled,
      windowLabel: getShiftWindowLabel(applied.startUtc, applied.endUtc, applied.timezone),
      leaveDaysLabel: formatLeaveDaysLabel(applied.leaveDays),
      startLocal: utcHhmmToZonedHhmm(applied.startUtc, applied.timezone),
      endLocal: utcHhmmToZonedHhmm(applied.endUtc, applied.timezone),
    };
  } catch {
    serializeShiftSettings(null);
    return getShiftSettings();
  }
}

async function ensureShiftSettingsLoaded() {
  if (!loadPromise) {
    loadPromise = loadShiftSettingsFromDb();
  }
  await loadPromise;
}

module.exports = {
  ensureShiftSettingsLoaded,
};
