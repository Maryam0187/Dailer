import db from "@/server/db";
import {
  getShiftWindowLabel,
  parseHhmm,
  utcHhmmToZonedHhmm,
  zonedHhmmToUtcHhmm,
} from "@/lib/shiftTime.cjs";
import {
  applyShiftSettings,
  DEFAULT_END_UTC,
  DEFAULT_LEAVE_DAYS,
  DEFAULT_START_UTC,
  DEFAULT_TIMEZONE,
  formatLeaveDaysLabel,
  getShiftSettings,
  getShiftWindowLabel as getShiftWindowLabelFromStore,
  normalizeLeaveDays,
  parseUtcTimeOfDay,
  readShiftEnabled,
  WEEKDAY_LABELS,
} from "@/server/auth/shiftSettingsStore.cjs";
import {
  DEFAULT_GRANT_DURATION_MINUTES,
  normalizeGrantDurationMinutes,
} from "@/server/auth/afterShiftGrant.cjs";

export { getShiftSettings, getShiftWindowLabelFromStore as getShiftWindowLabel, parseUtcTimeOfDay, WEEKDAY_LABELS };

const TIMEZONE_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Dubai", label: "UAE (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Europe/London", label: "UK (GMT/BST)" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "UTC", label: "UTC" },
];

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
  const applied = getShiftSettings();

  return {
    id: row?.id ?? null,
    enabled: applied.enabled,
    startUtc: applied.startUtc,
    endUtc: applied.endUtc,
    startLocal: utcHhmmToZonedHhmm(applied.startUtc, applied.timezone),
    endLocal: utcHhmmToZonedHhmm(applied.endUtc, applied.timezone),
    timezone: applied.timezone,
    leaveDays: applied.leaveDays,
    leaveDaysLabel: formatLeaveDaysLabel(applied.leaveDays),
    manuallyActive: applied.manuallyActive,
    windowLabel: getShiftWindowLabel(applied.startUtc, applied.endUtc, applied.timezone),
    timezoneOptions: TIMEZONE_OPTIONS,
    afterShiftGrantDurationMinutes: normalizeGrantDurationMinutes(
      row?.afterShiftGrantDurationMinutes,
      DEFAULT_GRANT_DURATION_MINUTES,
    ),
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getDefaultGrantDurationMinutes() {
  const record = await getShiftSettingsRecord();
  return record.afterShiftGrantDurationMinutes;
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
    return serializeShiftSettings(row);
  } catch {
    return serializeShiftSettings(null);
  }
}

export async function ensureShiftSettingsLoaded() {
  if (!loadPromise) {
    loadPromise = loadShiftSettingsFromDb();
  }
  await loadPromise;
}

export async function reloadShiftSettings() {
  loadPromise = loadShiftSettingsFromDb();
  return loadPromise;
}

export async function getShiftSettingsRecord() {
  return reloadShiftSettings();
}

export function parseShiftTimeInput(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const normalized = `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  return parseHhmm(normalized) != null ? normalized : null;
}

export async function updateShiftSettings(patch, updatedBy) {
  const enabled = readShiftEnabled(patch?.enabled, true);

  const timezoneRaw = String(patch?.timezone || DEFAULT_TIMEZONE).trim();
  const timezone = TIMEZONE_OPTIONS.some((opt) => opt.value === timezoneRaw)
    ? timezoneRaw
    : DEFAULT_TIMEZONE;

  let startUtc = parseShiftTimeInput(patch?.startUtc);
  let endUtc = parseShiftTimeInput(patch?.endUtc);

  const startLocal = parseShiftTimeInput(patch?.startLocal);
  const endLocal = parseShiftTimeInput(patch?.endLocal);

  if (startLocal && endLocal) {
    startUtc = zonedHhmmToUtcHhmm(startLocal, timezone);
    endUtc = zonedHhmmToUtcHhmm(endLocal, timezone);
  }

  if (!startUtc || !endUtc) {
    throw new Error("Start and end times must be valid HH:mm values.");
  }

  const startMinutes = parseHhmm(startUtc);
  const endMinutes = parseHhmm(endUtc);
  if (startMinutes == null || endMinutes == null) {
    throw new Error("Start and end times must be valid HH:mm values.");
  }

  if (startMinutes > endMinutes) {
    const localStart = utcHhmmToZonedHhmm(startUtc, timezone);
    const localEnd = utcHhmmToZonedHhmm(endUtc, timezone);
    throw new Error(
      `Start time must be before or equal to end time (${localStart} – ${localEnd} ${timezone}).`,
    );
  }

  const grantDuration =
    patch?.afterShiftGrantDurationMinutes !== undefined
      ? normalizeGrantDurationMinutes(patch.afterShiftGrantDurationMinutes)
      : undefined;

  const leaveDays =
    patch?.leaveDays !== undefined
      ? normalizeLeaveDays(patch.leaveDays, DEFAULT_LEAVE_DAYS)
      : undefined;

  let row = await db.ShiftSetting.findOne({ order: [["id", "DESC"]] });
  if (!row) {
    row = await db.ShiftSetting.create({
      enabled,
      startUtc,
      endUtc,
      timezone,
      leaveDays: leaveDays ?? DEFAULT_LEAVE_DAYS,
      afterShiftGrantDurationMinutes: grantDuration ?? DEFAULT_GRANT_DURATION_MINUTES,
      updatedBy: updatedBy ?? null,
    });
  } else {
    row.enabled = enabled;
    row.startUtc = startUtc;
    row.endUtc = endUtc;
    row.timezone = timezone;
    if (leaveDays != null) row.leaveDays = leaveDays;
    if (grantDuration != null) row.afterShiftGrantDurationMinutes = grantDuration;
    row.updatedBy = updatedBy ?? null;
    await row.save();
  }

  return reloadShiftSettings();
}

export async function updateShiftManuallyActive(manuallyActive, updatedBy) {
  const active = readShiftEnabled(manuallyActive, true);

  let row = await db.ShiftSetting.findOne({ order: [["id", "DESC"]] });
  if (!row) {
    const defaults = envDefaults();
    row = await db.ShiftSetting.create({
      enabled: defaults.enabled,
      startUtc: parseUtcTimeOfDay(defaults.startUtc) != null ? defaults.startUtc : DEFAULT_START_UTC,
      endUtc: parseUtcTimeOfDay(defaults.endUtc) != null ? defaults.endUtc : DEFAULT_END_UTC,
      timezone: defaults.timezone,
      leaveDays: defaults.leaveDays,
      manuallyActive: active,
      afterShiftGrantDurationMinutes: DEFAULT_GRANT_DURATION_MINUTES,
      updatedBy: updatedBy ?? null,
    });
  } else {
    row.manuallyActive = active;
    row.updatedBy = updatedBy ?? null;
    await row.save();
  }

  return reloadShiftSettings();
}

/** Read shift settings from DB, then return current shift status for display. */
export async function getLiveShiftStatus() {
  const { getShiftStatus } = await import("@/server/auth/loginWindow");
  await getShiftSettingsRecord();
  return getShiftStatus();
}
