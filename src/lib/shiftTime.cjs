"use strict";

function parseHhmm(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

function normalizeHhmm(value) {
  const minutes = parseHhmm(value);
  if (minutes == null) return null;
  return minutesToHhmm(minutes);
}

function minutesToHhmm(minutes) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function zonedMinutesOfDay(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

/** UTC HH:mm → zoned HH:mm (24h, for &lt;input type="time"&gt;). */
function utcHhmmToZonedHhmm(utcHhmm, timeZone) {
  const utcMinutes = parseHhmm(utcHhmm);
  if (utcMinutes == null || !timeZone) return null;

  const hour = Math.floor(utcMinutes / 60);
  const minute = utcMinutes % 60;
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));
  const zonedMinutes = zonedMinutesOfDay(date, timeZone);
  if (zonedMinutes == null) return null;
  return minutesToHhmm(zonedMinutes);
}

/** Zoned HH:mm → UTC HH:mm. */
function zonedHhmmToUtcHhmm(zonedHhmm, timeZone) {
  const targetMinutes = parseHhmm(zonedHhmm);
  if (targetMinutes == null || !timeZone) return null;

  for (let utcMinutes = 0; utcMinutes < 24 * 60; utcMinutes += 1) {
    const hour = Math.floor(utcMinutes / 60);
    const minute = utcMinutes % 60;
    const date = new Date(Date.UTC(2000, 0, 1, hour, minute));
    const zonedMinutes = zonedMinutesOfDay(date, timeZone);
    if (zonedMinutes === targetMinutes) {
      return minutesToHhmm(utcMinutes);
    }
  }

  return null;
}

function formatHhmmInTimezone(utcHhmm, timeZone) {
  const utcMinutes = parseHhmm(utcHhmm);
  if (utcMinutes == null || !timeZone) return utcHhmm;

  const hour = Math.floor(utcMinutes / 60);
  const minute = utcMinutes % 60;
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getTimezoneLabel(timeZone) {
  if (timeZone === "Asia/Karachi") return "Pakistan time";
  if (timeZone === "UTC") return "UTC";
  return timeZone;
}

function getTimezoneOptionLabel(value) {
  const labels = {
    "Asia/Karachi": "Pakistan (PKT)",
    "Asia/Dubai": "UAE (GST)",
    "Asia/Kolkata": "India (IST)",
    "Europe/London": "UK (GMT/BST)",
    "America/New_York": "US Eastern",
    UTC: "UTC",
  };
  return labels[value] || value;
}

function getShiftWindowLabel(startUtc, endUtc, timeZone) {
  const start = formatHhmmInTimezone(startUtc, timeZone);
  const end = formatHhmmInTimezone(endUtc, timeZone);
  return `${start} – ${end} ${getTimezoneLabel(timeZone)}`;
}

module.exports = {
  parseHhmm,
  normalizeHhmm,
  utcHhmmToZonedHhmm,
  zonedHhmmToUtcHhmm,
  zonedMinutesOfDay,
  formatHhmmInTimezone,
  getTimezoneLabel,
  getTimezoneOptionLabel,
  getShiftWindowLabel,
};
