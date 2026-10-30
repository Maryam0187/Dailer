import db from "@/server/db";

export const DEFAULT_CALLBACK_AFFINITY_DAYS = 6;
export const MIN_CALLBACK_AFFINITY_DAYS = 1;
export const MAX_CALLBACK_AFFINITY_DAYS = 30;

/** @type {{ callbackAffinityDays: number } | null} */
let cache = null;

export function clampCallbackAffinityDays(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return DEFAULT_CALLBACK_AFFINITY_DAYS;
  return Math.max(MIN_CALLBACK_AFFINITY_DAYS, Math.min(MAX_CALLBACK_AFFINITY_DAYS, n));
}

export function serializeIvrSettings(row) {
  const days = clampCallbackAffinityDays(
    row?.callbackAffinityDays ?? DEFAULT_CALLBACK_AFFINITY_DAYS,
  );
  return {
    callbackAffinityDays: days,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

async function findOrCreateRow() {
  let row = await db.IvrSetting.findOne({ order: [["id", "ASC"]] });
  if (!row) {
    row = await db.IvrSetting.create({
      callbackAffinityDays: DEFAULT_CALLBACK_AFFINITY_DAYS,
    });
  }
  return row;
}

export async function getIvrSettings() {
  if (cache) return cache;
  try {
    const row = await findOrCreateRow();
    cache = serializeIvrSettings(row);
    return cache;
  } catch (err) {
    console.warn("[ivr/settings] load", err?.message || err);
    return {
      callbackAffinityDays: DEFAULT_CALLBACK_AFFINITY_DAYS,
      updatedAt: null,
    };
  }
}

export async function getCallbackAffinityWindowMs() {
  const settings = await getIvrSettings();
  return clampCallbackAffinityDays(settings.callbackAffinityDays) * 24 * 60 * 60 * 1000;
}

export async function updateIvrSettings({ callbackAffinityDays } = {}, updatedBy = null) {
  const days = clampCallbackAffinityDays(callbackAffinityDays);
  const row = await findOrCreateRow();
  await row.update({
    callbackAffinityDays: days,
    updatedBy: Number.isInteger(Number(updatedBy)) && Number(updatedBy) > 0 ? Number(updatedBy) : null,
  });
  cache = serializeIvrSettings(row);
  return cache;
}

/** Clear in-memory cache (tests / after external DB edits). */
export function clearIvrSettingsCache() {
  cache = null;
}
