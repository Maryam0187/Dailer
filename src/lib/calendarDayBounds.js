/** App-wide report day bounds (US Eastern). Timestamps stay UTC; only day bounds use this zone. */
export const REPORT_TIMEZONE = "America/New_York";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(dateOnly, days) {
  const [y, m, d] = String(dateOnly).split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Convert a wall-clock date/time in `timeZone` to a UTC Date.
 * `dateOnly` is YYYY-MM-DD; `time` is HH:mm:ss (no Z, whole seconds).
 */
export function zonedDateTimeToUtc(dateOnly, time, timeZone = REPORT_TIMEZONE) {
  if (!DATE_ONLY_RE.test(String(dateOnly || "")) || !timeZone) return null;

  const desiredAsUtc = new Date(`${dateOnly}T${time}Z`);
  if (Number.isNaN(desiredAsUtc.getTime())) return null;

  // First guess: treat the wall time as UTC, then correct by the zone offset
  // at that instant (handles DST and fixed offsets).
  const asUtc = new Date(desiredAsUtc.getTime());
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asUtc);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  if (![year, month, day, hour, minute, second].every(Boolean)) return null;

  const actualAsUtc = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (Number.isNaN(actualAsUtc.getTime())) return null;

  return new Date(asUtc.getTime() + (desiredAsUtc.getTime() - actualAsUtc.getTime()));
}

/** Inclusive start of the calendar day in `timeZone` (as a UTC Date). */
export function zonedDayStart(dateOnly, timeZone = REPORT_TIMEZONE) {
  return zonedDateTimeToUtc(dateOnly, "00:00:00", timeZone);
}

/**
 * Exclusive end of the calendar day in `timeZone` (start of the next local day, UTC Date).
 * Prefer `createdAt >= start && createdAt < endExclusive`.
 */
export function zonedDayEndExclusive(dateOnly, timeZone = REPORT_TIMEZONE) {
  return zonedDayStart(addCalendarDays(dateOnly, 1), timeZone);
}

/**
 * UTC bounds for filtering timestamps that belong to local calendar days
 * `fromDate`..`toDate` (YYYY-MM-DD) in the app report timezone (US Eastern).
 * `after` is inclusive; `before` is exclusive (start of the day after `toDate`).
 */
export function calendarDateRangeBounds(fromDate, toDate, timeZone = REPORT_TIMEZONE) {
  if (!DATE_ONLY_RE.test(String(fromDate || "")) || !DATE_ONLY_RE.test(String(toDate || ""))) {
    return null;
  }
  const after = zonedDayStart(fromDate, timeZone);
  const before = zonedDayEndExclusive(toDate, timeZone);
  if (!after || !before) return null;
  return { after, before };
}
