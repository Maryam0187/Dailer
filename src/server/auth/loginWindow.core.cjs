// Pakistan shift: 6:00 PM – 11:00 PM PKT (UTC+5, no DST) = 13:00 – 18:00 UTC.
const DEFAULT_START_UTC = "13:00";
const DEFAULT_END_UTC = "18:00";
const SESSION_TIMEZONE = "Asia/Karachi";

function parseUtcTimeOfDay(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

function utcMinutesOfDay(date = new Date()) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function windowBounds() {
  const start =
    parseUtcTimeOfDay(process.env.LOGIN_WINDOW_START_UTC) ??
    parseUtcTimeOfDay(DEFAULT_START_UTC);
  const end =
    parseUtcTimeOfDay(process.env.LOGIN_WINDOW_END_UTC) ??
    parseUtcTimeOfDay(DEFAULT_END_UTC);

  return { start, end };
}

function isShiftWindowEnforced() {
  return process.env.LOGIN_WINDOW_ENABLED !== "false";
}

function isWithinLoginWindow(date = new Date()) {
  if (!isShiftWindowEnforced()) return true;

  const { start, end } = windowBounds();
  if (start == null || end == null) return true;

  const minutes = utcMinutesOfDay(date);
  return minutes >= start && minutes <= end;
}

function getAfterShiftAccess(user) {
  if (!user) return "none";
  if (user.afterShiftAccess) return user.afterShiftAccess;
  if (user.afterShiftFullAccess) return "full";
  return "none";
}

function hasAfterShiftGrant(user) {
  const access = getAfterShiftAccess(user);
  return access === "full" || access === "limited";
}

function isLoginAllowed(user, date = new Date()) {
  if (!isShiftWindowEnforced()) return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (hasAfterShiftGrant(user)) return true;
  return isWithinLoginWindow(date);
}

function loginWindowErrorMessage() {
  return "Sign-in is only allowed during shift hours (6:00 PM – 11:00 PM Pakistan time), unless an admin has granted after-shift access.";
}

function getShiftStatus(date = new Date()) {
  if (!isShiftWindowEnforced()) {
    return {
      status: "disabled",
      label: "Enforcement off",
      detail: "Shift login window is disabled",
    };
  }

  const active = isWithinLoginWindow(date);
  return {
    status: active ? "active" : "ended",
    label: active ? "Shift active" : "Shift ended",
    detail: "6:00 PM – 11:00 PM Pakistan time",
  };
}

function getSessionCalendarDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SESSION_TIMEZONE,
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
