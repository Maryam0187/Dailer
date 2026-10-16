"use strict";

/**
 * In-memory map of company-wide leave / public holiday dates (YYYY-MM-DD → label).
 * Loaded on boot and refreshed after admin create/delete.
 */
let leaveDateMap = new Map();
let loaded = false;

function normalizeDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function calendarDateInTimezone(date, timeZone = "Asia/Karachi") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getCompanyLeaveDateSet() {
  return new Set(leaveDateMap.keys());
}

function getCompanyLeaveLabel(dateOrStr) {
  const dateStr =
    typeof dateOrStr === "string"
      ? normalizeDateOnly(dateOrStr)
      : calendarDateInTimezone(dateOrStr);
  if (!dateStr) return null;
  if (!leaveDateMap.has(dateStr)) return null;
  return leaveDateMap.get(dateStr) || "Company leave";
}

/** @param {string|Date} dateOrStr YYYY-MM-DD or Date */
function isCompanyLeaveDate(dateOrStr, timeZone = "Asia/Karachi") {
  if (typeof dateOrStr === "string") {
    const dateStr = normalizeDateOnly(dateOrStr);
    return dateStr ? leaveDateMap.has(dateStr) : false;
  }
  if (dateOrStr instanceof Date) {
    const dateStr = calendarDateInTimezone(dateOrStr, timeZone);
    return dateStr ? leaveDateMap.has(dateStr) : false;
  }
  return false;
}

function listCompanyLeaveDatesInRange(fromDate, toDate) {
  const from = normalizeDateOnly(fromDate);
  const to = normalizeDateOnly(toDate);
  if (!from || !to) return [];
  const out = [];
  for (const [d, label] of leaveDateMap) {
    if (d >= from && d <= to) {
      out.push({ calendarDate: d, label: label || "Company leave" });
    }
  }
  out.sort((a, b) => a.calendarDate.localeCompare(b.calendarDate));
  return out;
}

async function reloadCompanyLeaveDates(db = null) {
  const database = db || require("../../../models");
  const rows = await database.CompanyLeaveDate.findAll({
    attributes: ["calendarDate", "label"],
    order: [["calendarDate", "ASC"]],
  });
  leaveDateMap = new Map();
  for (const row of rows) {
    const key = normalizeDateOnly(String(row.calendarDate));
    if (!key) continue;
    const label = row.label ? String(row.label).trim() : "";
    leaveDateMap.set(key, label || null);
  }
  loaded = true;
  return leaveDateMap.size;
}

async function ensureCompanyLeaveDatesLoaded(db = null) {
  if (loaded) return leaveDateMap.size;
  return reloadCompanyLeaveDates(db);
}

module.exports = {
  normalizeDateOnly,
  getCompanyLeaveDateSet,
  getCompanyLeaveLabel,
  isCompanyLeaveDate,
  listCompanyLeaveDatesInRange,
  reloadCompanyLeaveDates,
  ensureCompanyLeaveDatesLoaded,
};
