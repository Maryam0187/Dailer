import db from "@/server/db";
import {
  getShiftWindowLabel,
  parseHhmm,
  utcHhmmToZonedHhmm,
  zonedHhmmToUtcHhmm,
} from "@/lib/shiftTime.cjs";
import {
  applyShiftSettings,
  DEFAULT_LEAVE_DAYS,
  DEFAULT_SHIFT_KEY,
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
  WEEKDAY_LABELS,
} from "@/server/auth/shiftSettingsStore.cjs";
import {
  DEFAULT_GRANT_DURATION_MINUTES,
  normalizeGrantDurationMinutes,
} from "@/server/auth/afterShiftGrant.cjs";

export {
  getShiftSettings,
  getAllShiftSettings,
  normalizeShiftKey,
  SHIFT_KEYS,
  DEFAULT_SHIFT_KEY,
  WEEKDAY_LABELS,
  parseUtcTimeOfDay,
};

const TIMEZONE_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Dubai", label: "UAE (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Europe/London", label: "UK (GMT/BST)" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "UTC", label: "UTC" },
];

let loadPromise = null;
/** @type {Record<string, ReturnType<typeof buildShiftSettingsRecord>> | null} */
let lastRecords = null;
let lastLoadedAt = 0;
let lastLoadOk = false;

const SETTINGS_TTL_MS = 10_000;

function envDefaults(key = DEFAULT_SHIFT_KEY) {
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

function buildShiftSettingsRecord(row, key = DEFAULT_SHIFT_KEY) {
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
  const applied = getShiftSettings(normalizedKey);

  return {
    id: row?.id ?? null,
    key: applied.key,
    name: applied.name,
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
    loadOk: true,
  };
}

function withLoadOk(records, loadOk) {
  const next = {};
  for (const key of SHIFT_KEYS) {
    next[key] = { ...(records[key] || buildShiftSettingsRecord(null, key)), loadOk };
  }
  return next;
}

/** Primary record for APIs that historically returned one settings object (day shift). */
export function getPrimaryShiftRecord(records = lastRecords) {
  const map = records || withLoadOk(
    { day: buildShiftSettingsRecord(null, "day"), night: buildShiftSettingsRecord(null, "night") },
    false,
  );
  return map.day;
}

export async function getDefaultGrantDurationMinutes() {
  const records = await getShiftSettingsRecords();
  return records.day.afterShiftGrantDurationMinutes;
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
    const records = {};
    for (const key of SHIFT_KEYS) {
      records[key] = buildShiftSettingsRecord(byKey.get(key), key);
    }
    lastRecords = records;
    lastLoadedAt = Date.now();
    lastLoadOk = true;
    return records;
  } catch (err) {
    console.error("[shift] failed to reload settings:", err?.message || err);
    if (lastRecords) {
      lastLoadOk = false;
      return withLoadOk(lastRecords, false);
    }
    const fallback = withLoadOk(
      {
        day: buildShiftSettingsRecord(null, "day"),
        night: buildShiftSettingsRecord(null, "night"),
      },
      false,
    );
    lastRecords = fallback;
    lastLoadedAt = Date.now();
    lastLoadOk = false;
    return fallback;
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

/**
 * Fresh enough for auth/shift checks. Returns map `{ day, night }`.
 * Each record includes `loadOk: false` when the latest DB read failed.
 */
export async function getShiftSettingsRecords() {
  if (lastRecords && Date.now() - lastLoadedAt < SETTINGS_TTL_MS) {
    return withLoadOk(lastRecords, lastLoadOk);
  }
  return reloadShiftSettings();
}

/** @deprecated Prefer getShiftSettingsRecords(). Returns day shift for backward compatibility. */
export async function getShiftSettingsRecord() {
  const records = await getShiftSettingsRecords();
  return records.day;
}

export function parseShiftTimeInput(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const normalized = `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  return parseHhmm(normalized) != null ? normalized : null;
}

export async function updateShiftSettings(patch, updatedBy) {
  const shiftKey = normalizeShiftKey(patch?.shiftKey || patch?.key);
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

    const localStartMin = parseHhmm(startLocal);
    const localEndMin = parseHhmm(endLocal);
    if (localStartMin != null && localEndMin != null && localStartMin > localEndMin) {
      throw new Error(
        `Start time must be before or equal to end time (${startLocal} – ${endLocal} ${timezone}).`,
      );
    }
  }

  if (!startUtc || !endUtc) {
    throw new Error("Start and end times must be valid HH:mm values.");
  }

  const startMinutes = parseHhmm(startUtc);
  const endMinutes = parseHhmm(endUtc);
  if (startMinutes == null || endMinutes == null) {
    throw new Error("Start and end times must be valid HH:mm values.");
  }

  // UTC may wrap midnight (e.g. night shift 1–6 AM PKT). Local validation above covers UX.

  const grantDuration =
    patch?.afterShiftGrantDurationMinutes !== undefined
      ? normalizeGrantDurationMinutes(patch.afterShiftGrantDurationMinutes)
      : undefined;

  const leaveDays =
    patch?.leaveDays !== undefined
      ? normalizeLeaveDays(patch.leaveDays, DEFAULT_LEAVE_DAYS)
      : undefined;

  const name =
    patch?.name != null && String(patch.name).trim()
      ? String(patch.name).trim().slice(0, 64)
      : SHIFT_DEFAULTS[shiftKey].name;

  const byKey = await ensureShiftRows();
  let row = byKey.get(shiftKey);
  if (!row) {
    row = await db.ShiftSetting.create({
      key: shiftKey,
      name,
      enabled,
      startUtc,
      endUtc,
      timezone,
      leaveDays: leaveDays ?? DEFAULT_LEAVE_DAYS,
      afterShiftGrantDurationMinutes: grantDuration ?? DEFAULT_GRANT_DURATION_MINUTES,
      manuallyActive: true,
      updatedBy: updatedBy ?? null,
    });
  } else {
    row.name = name;
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

export async function updateShiftManuallyActive(manuallyActive, updatedBy, shiftKey = DEFAULT_SHIFT_KEY) {
  const active = readShiftEnabled(manuallyActive, true);
  const key = normalizeShiftKey(shiftKey);
  const byKey = await ensureShiftRows();
  let row = byKey.get(key);

  if (!row) {
    const defaults = envDefaults(key);
    row = await db.ShiftSetting.create({
      key: defaults.key,
      name: defaults.name,
      enabled: defaults.enabled,
      startUtc: defaults.startUtc,
      endUtc: defaults.endUtc,
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

/** Read shift settings from DB, then return status. Pass user for per-user window. */
export async function getLiveShiftStatus(user = null) {
  const { getShiftStatus, getAllShiftStatuses } = await import("@/server/auth/loginWindow");
  await getShiftSettingsRecords();
  if (user && user.role !== "admin") {
    return getShiftStatus(new Date(), user);
  }
  return getAllShiftStatuses();
}
