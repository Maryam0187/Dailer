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
  normalizeShiftKey,
  DEFAULT_LEAVE_DAYS,
  DEFAULT_SHIFT_KEY,
  WEEKDAY_LABELS,
  isMinutesWithinUtcWindow,
  minutesUntilUtcWindowEnd,
} = require("./shiftSettingsStore.cjs");
const { isAfterShiftGrantExpired } = require("./afterShiftGrant.cjs");

const SHIFT_ENDING_WARNING_MINUTES = 15;

function utcMinutesOfDay(date = new Date()) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function resolveShiftKey(userOrKey) {
  if (userOrKey == null) return DEFAULT_SHIFT_KEY;
  if (typeof userOrKey === "string") return normalizeShiftKey(userOrKey);
  if (typeof userOrKey === "object") {
    if (userOrKey.role === "admin") return DEFAULT_SHIFT_KEY;
    return normalizeShiftKey(userOrKey.shiftKey);
  }
  return DEFAULT_SHIFT_KEY;
}

function settingsFor(userOrKey) {
  return getShiftSettings(resolveShiftKey(userOrKey));
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

function isShiftWindowEnforced(userOrKey) {
  return readShiftEnabled(settingsFor(userOrKey).enabled, true);
}

function isManuallyActive(userOrKey) {
  return readShiftEnabled(settingsFor(userOrKey).manuallyActive, true);
}

function isLeaveDay(date = new Date(), userOrKey) {
  const settings = settingsFor(userOrKey);
  const leaveDays = normalizeLeaveDays(settings.leaveDays, DEFAULT_LEAVE_DAYS);
  if (leaveDays.length === 0) return false;
  const weekday = getWeekdayInTimezone(date, settings.timezone || "Asia/Karachi");
  return leaveDays.includes(weekday);
}

function getLeaveDayLabel(date = new Date(), userOrKey) {
  const settings = settingsFor(userOrKey);
  const weekday = getWeekdayInTimezone(date, settings.timezone || "Asia/Karachi");
  return WEEKDAY_LABELS[weekday] || "Leave day";
}

function isWithinLoginWindow(date = new Date(), userOrKey) {
  // Support legacy call shape: isWithinLoginWindow(user)
  if (date && typeof date === "object" && !(date instanceof Date) && date.role != null) {
    userOrKey = date;
    date = new Date();
  }

  if (!isShiftWindowEnforced(userOrKey)) return true;
  if (!isManuallyActive(userOrKey)) return false;

  const settings = settingsFor(userOrKey);
  const start = parseHhmm(settings.startUtc);
  const end = parseHhmm(settings.endUtc);
  const minutes = utcMinutesOfDay(date);
  return isMinutesWithinUtcWindow(minutes, start, end);
}

function isLoginAllowed(user, date = new Date()) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!isShiftWindowEnforced(user)) return true;
  if (hasAfterShiftGrant(user, date)) return true;
  if (isLeaveDay(date, user)) return false;
  return isWithinLoginWindow(date, user);
}

function currentShiftWindowLabel(userOrKey) {
  const settings = settingsFor(userOrKey);
  return getShiftWindowLabel(settings.startUtc, settings.endUtc, settings.timezone);
}

function getMinutesUntilShiftEnd(date = new Date(), userOrKey) {
  if (!isShiftWindowEnforced(userOrKey) || !isManuallyActive(userOrKey) || isLeaveDay(date, userOrKey)) {
    return null;
  }

  const settings = settingsFor(userOrKey);
  const start = parseHhmm(settings.startUtc);
  const end = parseHhmm(settings.endUtc);
  const minutes = utcMinutesOfDay(date);
  return minutesUntilUtcWindowEnd(minutes, start, end);
}

function getShiftEndingSoonInfo(date = new Date(), userOrKey) {
  const settings = settingsFor(userOrKey);
  const minutesRemaining = getMinutesUntilShiftEnd(date, userOrKey);
  const endingSoon =
    minutesRemaining != null &&
    minutesRemaining <= SHIFT_ENDING_WARNING_MINUTES &&
    isWithinLoginWindow(date, userOrKey);

  return {
    endingSoon,
    minutesRemaining,
    shiftEndLabel: formatHhmmInTimezone(settings.endUtc, settings.timezone),
    timezoneLabel: getTimezoneLabel(settings.timezone),
    warningMinutes: SHIFT_ENDING_WARNING_MINUTES,
  };
}

function loginWindowErrorMessage(date = new Date(), userOrKey) {
  if (isLeaveDay(date, userOrKey)) {
    return `Sign-in is not allowed on leave days (${getLeaveDayLabel(date, userOrKey)}).`;
  }
  if (!isManuallyActive(userOrKey)) {
    return "Shift has been ended by an admin. Sign-in is not allowed until the shift is activated again.";
  }
  const settings = settingsFor(userOrKey);
  const shiftName = settings.name || resolveShiftKey(userOrKey);
  const windowLabel = currentShiftWindowLabel(userOrKey);
  return `Sign-in is only allowed during ${shiftName} shift hours (${windowLabel}), unless an admin has granted after-shift access.`;
}

function getShiftStatus(date = new Date(), userOrKey) {
  const settings = settingsFor(userOrKey);
  const shiftKey = resolveShiftKey(userOrKey);
  const shiftName = settings.name || shiftKey;

  if (!isShiftWindowEnforced(userOrKey)) {
    return {
      status: "disabled",
      label: `${shiftName}: enforcement off`,
      detail: "Shift login window is disabled",
      windowLabel: currentShiftWindowLabel(userOrKey),
      shiftKey,
      shiftName,
      active: true,
    };
  }

  if (isLeaveDay(date, userOrKey)) {
    const leaveDayLabel = getLeaveDayLabel(date, userOrKey);
    return {
      status: "leave",
      label: `${shiftName}: leave day`,
      detail: `No sign-in today (${leaveDayLabel})`,
      windowLabel: currentShiftWindowLabel(userOrKey),
      shiftKey,
      shiftName,
      active: false,
    };
  }

  if (!isManuallyActive(userOrKey)) {
    return {
      status: "paused",
      label: `${shiftName}: ended`,
      detail: "Manually ended by admin",
      windowLabel: currentShiftWindowLabel(userOrKey),
      shiftKey,
      shiftName,
      active: false,
    };
  }

  const active = isWithinLoginWindow(date, userOrKey);
  const windowLabel = currentShiftWindowLabel(userOrKey);
  const endingSoonInfo = getShiftEndingSoonInfo(date, userOrKey);
  return {
    status: active ? "active" : "ended",
    label: active ? `${shiftName}: active` : `${shiftName}: ended`,
    detail: windowLabel,
    windowLabel,
    shiftKey,
    shiftName,
    active,
    ...endingSoonInfo,
  };
}

/** Combined status for admin badge / public overview. */
function getAllShiftStatuses(date = new Date()) {
  const day = getShiftStatus(date, "day");
  const night = getShiftStatus(date, "night");
  const anyActive = day.active || night.active;
  const bothDisabled = day.status === "disabled" && night.status === "disabled";

  let status = "ended";
  let label = "Shifts ended";
  if (bothDisabled) {
    status = "disabled";
    label = "Enforcement off";
  } else if (anyActive) {
    status = "active";
    const activeNames = [day, night].filter((s) => s.active).map((s) => s.shiftName);
    label = activeNames.length === 2 ? "Day & night active" : `${activeNames[0]} active`;
  } else if (day.status === "leave" && night.status === "leave") {
    status = "leave";
    label = "Leave day";
  } else if (day.status === "paused" && night.status === "paused") {
    status = "paused";
    label = "Shifts ended";
  }

  return {
    status,
    label,
    detail: `Day: ${day.windowLabel} · Night: ${night.windowLabel}`,
    windowLabel: `Day ${day.windowLabel} · Night ${night.windowLabel}`,
    active: anyActive,
    shifts: { day, night },
  };
}

function getSessionCalendarDate(date = new Date(), userOrKey) {
  const timeZone = settingsFor(userOrKey).timezone || "Asia/Karachi";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isSessionValidForToday(payload, date = new Date(), userOrKey) {
  const sessionDay = payload?.sessionDay;
  if (!sessionDay || typeof sessionDay !== "string") return false;
  return sessionDay === getSessionCalendarDate(date, userOrKey);
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
  getAllShiftStatuses,
  getShiftEndingSoonInfo,
  getMinutesUntilShiftEnd,
  SHIFT_ENDING_WARNING_MINUTES,
  getSessionCalendarDate,
  isSessionValidForToday,
  resolveShiftKey,
};
