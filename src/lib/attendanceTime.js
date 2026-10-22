/** Shared PKT/ET display + Eastern day presets (aligned with REPORT_TIMEZONE / shift). */
export const ATTENDANCE_TZ_PKT = "Asia/Karachi";
export const ATTENDANCE_TZ_ET = "America/New_York";

/** Day presets / calendarDate alignment with shift & report filters (US Eastern). */
export const ATTENDANCE_REPORT_TIMEZONE = ATTENDANCE_TZ_ET;

export const ATTENDANCE_EASTERN_TODAY_NOTICE =
  "Today and date presets use US Eastern time, not Pakistan local midnight.";

/** Alias for non-attendance screens. */
export const REPORT_EASTERN_TODAY_NOTICE = ATTENDANCE_EASTERN_TODAY_NOTICE;

const ZONE_SHORT_LABEL = {
  [ATTENDANCE_TZ_PKT]: "PKT",
  [ATTENDANCE_TZ_ET]: "ET",
};

/**
 * Format a UTC instant in a zone. Uses fixed PKT/ET labels — Intl often shows
 * "GMT+5" for Asia/Karachi instead of "PKT".
 */
export function formatAttendanceTime(value, timeZone) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    const label = ZONE_SHORT_LABEL[timeZone];
    return label ? `${clock} ${label}` : clock;
  } catch {
    return "—";
  }
}

export function formatAttendanceTimePkt(value) {
  return formatAttendanceTime(value, ATTENDANCE_TZ_PKT);
}

export function formatAttendanceTimeEt(value) {
  return formatAttendanceTime(value, ATTENDANCE_TZ_ET);
}

/** Date + time in a zone (call logs, lead timestamps). */
export function formatReportDateTime(value, timeZone) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    const label = ZONE_SHORT_LABEL[timeZone];
    return label ? `${clock} ${label}` : clock;
  } catch {
    return "—";
  }
}

export function formatReportDateTimePkt(value) {
  return formatReportDateTime(value, ATTENDANCE_TZ_PKT);
}

export function formatReportDateTimeEt(value) {
  return formatReportDateTime(value, ATTENDANCE_TZ_ET);
}

/** e.g. "Oct 22, 2026, 1:22 PM ET (Oct 22, 2026, 10:22 PM PKT)" */
export function formatReportDateTimeDual(value) {
  if (!value) return "—";
  const et = formatReportDateTime(value, ATTENDANCE_TZ_ET);
  const pkt = formatReportDateTime(value, ATTENDANCE_TZ_PKT);
  if (et === "—" || pkt === "—") return "—";
  return `${et} (${pkt})`;
}

/** Shorter dual for activity/call rows (no year). */
export function formatReportWhenDual(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const opts = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const et = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: ATTENDANCE_TZ_ET }).format(d);
    const pkt = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: ATTENDANCE_TZ_PKT }).format(d);
    return `${et} ET (${pkt} PKT)`;
  } catch {
    return "";
  }
}

function formatPartsInZone(d, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const month = get("month");
  const day = get("day");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod");
  return {
    dateKey: calendarDateInTimezone(d, timeZone),
    dateLabel: `${month} ${day}, ${year}`,
    timeLabel: `${hour}:${minute} ${dayPeriod}`,
  };
}

/**
 * Call-log friendly dual zone: one shared date when ET/PKT calendar days match.
 * { sameDate, dateLabel, etTime, pktTime, etDateLabel, pktDateLabel }
 */
export function getDualZoneWhenParts(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const et = formatPartsInZone(d, ATTENDANCE_TZ_ET);
    const pkt = formatPartsInZone(d, ATTENDANCE_TZ_PKT);
    const sameDate = et.dateKey === pkt.dateKey;
    return {
      sameDate,
      dateLabel: et.dateLabel,
      etTime: et.timeLabel,
      pktTime: pkt.timeLabel,
      etDateLabel: et.dateLabel,
      pktDateLabel: pkt.dateLabel,
    };
  } catch {
    return null;
  }
}

export function calendarDateInTimezone(date = new Date(), timeZone = ATTENDANCE_REPORT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDays(dateOnly, days) {
  const [y, m, d] = String(dateOnly).split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startOfMonthDateOnly(dateOnly) {
  const [y, m] = String(dateOnly).split("-");
  return `${y}-${m}-01`;
}

/**
 * Date presets in US Eastern (default), matching server REPORT_TIMEZONE day bounds.
 */
export function getAttendancePresetRange(preset, timeZone = ATTENDANCE_REPORT_TIMEZONE) {
  if (preset === "all" || preset === "custom") {
    return { from: "", to: "" };
  }
  const key = preset === "last7" ? "week" : preset;
  const today = calendarDateInTimezone(new Date(), timeZone);
  if (key === "today") {
    return { from: today, to: today };
  }
  if (key === "yesterday") {
    const y = addCalendarDays(today, -1);
    return { from: y, to: y };
  }
  if (key === "week") {
    return { from: addCalendarDays(today, -6), to: today };
  }
  if (key === "month") {
    return { from: startOfMonthDateOnly(today), to: today };
  }
  return { from: "", to: "" };
}

/** Shared alias for Leads, Call Logs, Reports, etc. */
export function getReportPresetRange(preset, timeZone = ATTENDANCE_REPORT_TIMEZONE) {
  return getAttendancePresetRange(preset, timeZone);
}
