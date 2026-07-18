"use strict";

const db = require("../../../models");
const {
  getShiftWindowLabel,
  utcHhmmToZonedHhmm,
} = require("../../lib/shiftTime.cjs");
const {
  applyShiftSettings,
  DEFAULT_LEAVE_DAYS,
  DEFAULT_TIMEZONE,
  formatLeaveDaysLabel,
  getAllShiftSettings,
  getShiftSettings,
  normalizeLeaveDays,
  normalizeShiftKey,
  parseUtcTimeOfDay,
  readShiftEnabled,
  SHIFT_DEFAULTS,
  SHIFT_KEYS,
} = require("./shiftSettingsStore.cjs");
const {
  DEFAULT_GRANT_DURATION_MINUTES,
  normalizeGrantDurationMinutes,
} = require("./afterShiftGrant.cjs");

let loadPromise = null;

function envDefaults(key) {
  const base = SHIFT_DEFAULTS[normalizeShiftKey(key)] || SHIFT_DEFAULTS.day;
  return {
    key: base.key,
    name: base.name,
    enabled: readShiftEnabled(process.env.LOGIN_WINDOW_ENABLED, true),
    startUtc: base.startUtc,
    endUtc: base.endUtc,
    timezone: base.timezone || DEFAULT_TIMEZONE,
    leaveDays: [...DEFAULT_LEAVE_DAYS],
    manuallyActive: true,
  };
}

function serializeShiftSettings(row, key) {
  const normalizedKey = normalizeShiftKey(row?.key || key);
  const defaults = envDefaults(normalizedKey);
  const settings = row
    ? {
        key: normalizedKey,
        name: row.name || defaults.name,
        enabled: readShiftEnabled(row.enabled, true),
        startUtc: row.startUtc,
        endUtc: row.endUtc,
        timezone: row.timezone || DEFAULT_TIMEZONE,
        leaveDays: normalizeLeaveDays(row.leaveDays, DEFAULT_LEAVE_DAYS),
        manuallyActive: readShiftEnabled(row.manuallyActive, true),
      }
    : defaults;

  applyShiftSettings(settings, normalizedKey);
}

async function ensureShiftRows() {
  const rows = await db.ShiftSetting.findAll({ order: [["id", "ASC"]] });
  const byKey = new Map();
  for (const row of rows) {
    const key = normalizeShiftKey(row.key, null);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }

  for (const key of SHIFT_KEYS) {
    if (byKey.has(key)) continue;
    const defaults = envDefaults(key);
    const created = await db.ShiftSetting.create({
      key: defaults.key,
      name: defaults.name,
      enabled: defaults.enabled,
      startUtc: parseUtcTimeOfDay(defaults.startUtc) != null ? defaults.startUtc : defaults.startUtc,
      endUtc: parseUtcTimeOfDay(defaults.endUtc) != null ? defaults.endUtc : defaults.endUtc,
      timezone: defaults.timezone,
      leaveDays: defaults.leaveDays,
      manuallyActive: defaults.manuallyActive,
      afterShiftGrantDurationMinutes: DEFAULT_GRANT_DURATION_MINUTES,
      updatedBy: null,
    });
    byKey.set(key, created);
  }
  return byKey;
}

async function loadShiftSettingsFromDb() {
  try {
    const byKey = await ensureShiftRows();
    for (const key of SHIFT_KEYS) {
      serializeShiftSettings(byKey.get(key), key);
    }
    const all = getAllShiftSettings();
    return {
      day: {
        enabled: all.day.enabled,
        windowLabel: getShiftWindowLabel(all.day.startUtc, all.day.endUtc, all.day.timezone),
        leaveDaysLabel: formatLeaveDaysLabel(all.day.leaveDays),
        startLocal: utcHhmmToZonedHhmm(all.day.startUtc, all.day.timezone),
        endLocal: utcHhmmToZonedHhmm(all.day.endUtc, all.day.timezone),
        afterShiftGrantDurationMinutes: normalizeGrantDurationMinutes(
          byKey.get("day")?.afterShiftGrantDurationMinutes,
          DEFAULT_GRANT_DURATION_MINUTES,
        ),
      },
      night: {
        enabled: all.night.enabled,
        windowLabel: getShiftWindowLabel(all.night.startUtc, all.night.endUtc, all.night.timezone),
        leaveDaysLabel: formatLeaveDaysLabel(all.night.leaveDays),
        startLocal: utcHhmmToZonedHhmm(all.night.startUtc, all.night.timezone),
        endLocal: utcHhmmToZonedHhmm(all.night.endUtc, all.night.timezone),
      },
    };
  } catch (err) {
    console.error("[shift] failed to load settings on boot:", err?.message || err);
    return getAllShiftSettings();
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
