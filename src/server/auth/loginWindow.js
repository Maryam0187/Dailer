// Pakistan shift: 6:00 PM – 11:00 PM PKT (UTC+5, no DST) = 13:00 – 18:00 UTC.
const DEFAULT_START_UTC = "13:00";
const DEFAULT_END_UTC = "18:00";

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

export function isShiftWindowEnforced() {
  return process.env.LOGIN_WINDOW_ENABLED !== "false";
}

export function isWithinLoginWindow(date = new Date()) {
  if (!isShiftWindowEnforced()) return true;

  const { start, end } = windowBounds();
  if (start == null || end == null) return true;

  const minutes = utcMinutesOfDay(date);
  return minutes >= start && minutes <= end;
}

export function isLoginAllowedForRole(role, date = new Date()) {
  if (!isShiftWindowEnforced()) return true;
  if (role === "admin") return true;
  return isWithinLoginWindow(date);
}

export function loginWindowErrorMessage() {
  return "Sign-in is only allowed during shift hours (6:00 PM – 11:00 PM Pakistan time).";
}
