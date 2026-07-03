// Shift bounds are stored as UTC (HH:mm). Compare in UTC for reliable enforcement.
const {
  parseHhmm,
  formatHhmmInTimezone,
  getShiftWindowLabel,
  getTimezoneLabel,
} = require("../../lib/shiftTime.cjs");
const {
  getShiftSettings,
  readShiftEnabled,
  getWeekdayInTimezone,
  normalizeLeaveDays,
  DEFAULT_LEAVE_DAYS,
  WEEKDAY_LABELS,
} = require("./shiftSettingsStore.cjs");
const { isAfterShiftGrantExpired } = require("./afterShiftGrant.cjs");

const SHIFT_ENDING_WARNING_MINUTES = 15;

function utcMinutesOfDay(date = new Date()) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function getAfterShiftAccess(user, date = new Date()) {
  if (!user) return "none";
  const access = user.afterShiftAccess;
  let effective = "none";
  if (access === "full" || access === "limited") effective = access;
  else if (user.afterShiftFullAccess) effective = "full";
  if (effective !== "none" && isAfterShiftGrantExpired(user, date)) return "none";
  return effective;
}

function hasAfterShiftGrant(user, date = new Date()) {
  const access = getAfterShiftAccess(user, date);
  return access === "full" || access === "limited";
}

function isShiftWindowEnforced() {
  return readShiftEnabled(getShiftSettings().enabled, true);
}

function isManuallyActive() {
  return readShiftEnabled(getShiftSettings().manuallyActive, true);
}

function isLeaveDay(date = new Date()) {
  const settings = getShiftSettings();
  const leaveDays = normalizeLeaveDays(settings.leaveDays, DEFAULT_LEAVE_DAYS);
  if (leaveDays.length === 0) return false;
  const weekday = getWeekdayInTimezone(date, settings.timezone || "Asia/Karachi");
  return leaveDays.includes(weekday);
}

function getLeaveDayLabel(date = new Date()) {
  const settings = getShiftSettings();
  const weekday = getWeekdayInTimezone(date, settings.timezone || "Asia/Karachi");
  return WEEKDAY_LABELS[weekday] || "Leave day";
}

function isWithinLoginWindow(date = new Date()) {
  if (!isShiftWindowEnforced()) return true;
  if (!isManuallyActive()) return false;

  const settings = getShiftSettings();
  const start = parseHhmm(settings.startUtc);
  const end = parseHhmm(settings.endUtc);
  if (start == null || end == null) return false;

  const minutes = utcMinutesOfDay(date);
  return minutes >= start && minutes <= end;
}

function isLoginAllowed(user, date = new Date()) {
  if (!isShiftWindowEnforced()) return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (hasAfterShiftGrant(user, date)) return true;
  if (isLeaveDay(date)) return false;
  return isWithinLoginWindow(date);
}

function currentShiftWindowLabel() {
  const settings = getShiftSettings();
  return getShiftWindowLabel(settings.startUtc, settings.endUtc, settings.timezone);
}

function getMinutesUntilShiftEnd(date = new Date()) {
  if (!isShiftWindowEnforced() || !isManuallyActive() || isLeaveDay(date)) return null;

  const settings = getShiftSettings();
  const end = parseHhmm(settings.endUtc);
  if (end == null) return null;

  const minutes = utcMinutesOfDay(date);
  if (minutes > end) return null;
  return end - minutes;
}

function getShiftEndingSoonInfo(date = new Date()) {
  const settings = getShiftSettings();
  const minutesRemaining = getMinutesUntilShiftEnd(date);
  const endingSoon =
    minutesRemaining != null &&
    minutesRemaining <= SHIFT_ENDING_WARNING_MINUTES &&
    isWithinLoginWindow(date);

  return {
    endingSoon,
    minutesRemaining,
    shiftEndLabel: formatHhmmInTimezone(settings.endUtc, settings.timezone),
    timezoneLabel: getTimezoneLabel(settings.timezone),
    warningMinutes: SHIFT_ENDING_WARNING_MINUTES,
  };
}

function loginWindowErrorMessage(date = new Date()) {
  if (isLeaveDay(date)) {
    return `Sign-in is not allowed on leave days (${getLeaveDayLabel(date)}).`;
  }
  if (!isManuallyActive()) {
    return "Shift has been ended by an admin. Sign-in is not allowed until the shift is activated again.";
  }
  const windowLabel = currentShiftWindowLabel();
  return `Sign-in is only allowed during shift hours (${windowLabel}), unless an admin has granted after-shift access.`;
}

function getShiftStatus(date = new Date()) {
  if (!isShiftWindowEnforced()) {
    return {
      status: "disabled",
      label: "Enforcement off",
      detail: "Shift login window is disabled",
      windowLabel: currentShiftWindowLabel(),
      active: true,
    };
  }

  if (isLeaveDay(date)) {
    const leaveDayLabel = getLeaveDayLabel(date);
    return {
      status: "leave",
      label: "Leave day",
      detail: `No sign-in today (${leaveDayLabel})`,
      windowLabel: currentShiftWindowLabel(),
      active: false,
    };
  }

  if (!isManuallyActive()) {
    return {
      status: "paused",
      label: "Shift ended",
      detail: "Manually ended by admin",
      windowLabel: currentShiftWindowLabel(),
      active: false,
    };
  }

  const active = isWithinLoginWindow(date);
  const windowLabel = currentShiftWindowLabel();
  const endingSoonInfo = getShiftEndingSoonInfo(date);
  return {
    status: active ? "active" : "ended",
    label: active ? "Shift active" : "Shift ended",
    detail: windowLabel,
    windowLabel,
    active,
    ...endingSoonInfo,
  };
}

function getSessionCalendarDate(date = new Date()) {
  const timeZone = getShiftSettings().timezone || "Asia/Karachi";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isSessionValidForToday(payload, date = new Date()) {
  const sessionDay = payload?.sessionDay;
  if (!sessionDay || typeof sessionDay !== "string") return false;
  return sessionDay === getSessionCalendarDate(date);
}

module.exports = {
  getAfterShiftAccess,
  hasAfterShiftGrant,
  isShiftWindowEnforced,
  isManuallyActive,
  isLeaveDay,
  isWithinLoginWindow,
  isLoginAllowed,
  loginWindowErrorMessage,
  getShiftStatus,
  getShiftEndingSoonInfo,
  getMinutesUntilShiftEnd,
  SHIFT_ENDING_WARNING_MINUTES,
  getSessionCalendarDate,
  isSessionValidForToday,
};
