"use strict";

const DEFAULT_GRANT_DURATION_MINUTES = 120;
const MIN_GRANT_DURATION_MINUTES = 15;
const MAX_GRANT_DURATION_MINUTES = 24 * 60;

function parseGrantDurationMinutes(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < MIN_GRANT_DURATION_MINUTES || n > MAX_GRANT_DURATION_MINUTES) return null;
  return n;
}

function normalizeGrantDurationMinutes(value, fallback = DEFAULT_GRANT_DURATION_MINUTES) {
  return parseGrantDurationMinutes(value) ?? parseGrantDurationMinutes(fallback) ?? DEFAULT_GRANT_DURATION_MINUTES;
}

function computeGrantExpiresAt(durationMinutes, from = new Date()) {
  const minutes = normalizeGrantDurationMinutes(durationMinutes);
  return new Date(from.getTime() + minutes * 60 * 1000);
}

function isAfterShiftGrantExpired(user, date = new Date()) {
  if (!user?.afterShiftAccessExpiresAt) return false;
  return new Date(user.afterShiftAccessExpiresAt).getTime() <= date.getTime();
}

function hasStoredAfterShiftGrant(user) {
  const access = user?.afterShiftAccess;
  return access === "full" || access === "limited";
}

function resolveGrantDurationMinutes(user, bodyDuration, globalDefaultMinutes) {
  const fromBody = parseGrantDurationMinutes(bodyDuration);
  if (fromBody) return fromBody;
  const fromUser = parseGrantDurationMinutes(user?.afterShiftGrantDurationMinutes);
  if (fromUser) return fromUser;
  return normalizeGrantDurationMinutes(globalDefaultMinutes);
}

module.exports = {
  DEFAULT_GRANT_DURATION_MINUTES,
  MIN_GRANT_DURATION_MINUTES,
  MAX_GRANT_DURATION_MINUTES,
  parseGrantDurationMinutes,
  normalizeGrantDurationMinutes,
  computeGrantExpiresAt,
  isAfterShiftGrantExpired,
  hasStoredAfterShiftGrant,
  resolveGrantDurationMinutes,
};
