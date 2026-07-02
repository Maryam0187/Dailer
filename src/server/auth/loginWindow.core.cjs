// Shift bounds are stored as UTC (HH:mm). Compare in UTC for reliable enforcement.
const { parseHhmm } = require("../../lib/shiftTime.cjs");
const {
  getShiftSettings,
  getShiftWindowLabel,
  readShiftEnabled,
} = require("./shiftSettingsStore.cjs");

function utcMinutesOfDay(date = new Date()) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function getAfterShiftAccess(user) {
  if (!user) return "none";
  const access = user.afterShiftAccess;
  if (access === "full" || access === "limited") return access;
  if (user.afterShiftFullAccess) return "full";
  return "none";
}

function hasAfterShiftGrant(user) {
  const access = getAfterShiftAccess(user);
  return access === "full" || access === "limited";
}

function isShiftWindowEnforced() {
  return readShiftEnabled(getShiftSettings().enabled, true);
}

function isWithinLoginWindow(date = new Date()) {
  if (!isShiftWindowEnforced()) return true;

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
  if (hasAfterShiftGrant(user)) return true;
  return isWithinLoginWindow(date);
}

function loginWindowErrorMessage() {
  const windowLabel = getShiftWindowLabel();
  return `Sign-in is only allowed during shift hours (${windowLabel}), unless an admin has granted after-shift access.`;
}

function getShiftStatus(date = new Date()) {
  if (!isShiftWindowEnforced()) {
    return {
      status: "disabled",
      label: "Enforcement off",
      detail: "Shift login window is disabled",
      windowLabel: getShiftWindowLabel(),
      active: true,
    };
  }

  const active = isWithinLoginWindow(date);
  const windowLabel = getShiftWindowLabel();
  return {
    status: active ? "active" : "ended",
    label: active ? "Shift active" : "Shift ended",
    detail: windowLabel,
    windowLabel,
    active,
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
  isWithinLoginWindow,
  isLoginAllowed,
  loginWindowErrorMessage,
  getShiftStatus,
  getSessionCalendarDate,
  isSessionValidForToday,
};
