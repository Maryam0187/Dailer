"use strict";

/**
 * Accumulate Socket.IO online time into AttendanceDailyRecords.onlineMs.
 * Tracks per-user open intervals in memory; flushes on disconnect and on a timer
 * so crashes only lose up to one flush window.
 */

const db = require("../../../models");
const { getSessionCalendarDate } = require("../auth/loginWindow.core.cjs");

const FLUSH_INTERVAL_MS = 60 * 1000;
const MAX_SEGMENT_MS = 6 * 60 * 60 * 1000;

/** @type {Map<number, number>} userId -> ms when they went 0→1 online */
const onlineSinceByUser = new Map();
/** @type {Map<number, number>} userId -> ms last credited to DB while still online */
const lastCreditedByUser = new Map();

let flushTimer = null;

function clampDelta(deltaMs) {
  const n = Number(deltaMs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_SEGMENT_MS);
}

async function loadUserForCalendar(userId) {
  return db.User.findByPk(userId, {
    attributes: ["id", "role", "shiftKey", "isOutside", "loginWindowExempt"],
  });
}

/**
 * Add deltaMs to the daily aggregate for the calendar day of `at`.
 */
async function addOnlineMs(userId, deltaMs, at = new Date()) {
  const id = Number(userId);
  const delta = clampDelta(deltaMs);
  if (!Number.isInteger(id) || id <= 0 || delta <= 0) return;

  let user;
  try {
    user = await loadUserForCalendar(id);
  } catch (err) {
    console.error("[onlineTime] load user failed:", err?.message || err);
    return;
  }
  if (!user) return;

  const calendarDate = getSessionCalendarDate(at, user);

  try {
    const [record] = await db.AttendanceDailyRecord.findOrCreate({
      where: { userId: id, calendarDate },
      defaults: {
        userId: id,
        calendarDate,
        status: "present",
        tierKey: null,
        pointPercent: null,
        pointsEarned: 0,
        loginCount: 0,
        onlineMs: 0,
      },
    });
    await record.increment("onlineMs", { by: delta });
  } catch (err) {
    console.error("[onlineTime] increment failed:", err?.message || err);
  }
}

async function creditOpenSegment(userId, nowMs = Date.now()) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!onlineSinceByUser.has(id)) return;

  const last = lastCreditedByUser.get(id) ?? onlineSinceByUser.get(id);
  const delta = nowMs - last;
  if (delta > 0) {
    await addOnlineMs(id, delta, new Date(last));
  }
  lastCreditedByUser.set(id, nowMs);
}

/**
 * Call when socket count goes 0 → 1.
 */
function markUserOnline(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (onlineSinceByUser.has(id)) return;
  const now = Date.now();
  onlineSinceByUser.set(id, now);
  lastCreditedByUser.set(id, now);
}

/**
 * Call when socket count goes → 0. Credits remaining open time.
 */
async function markUserOffline(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!onlineSinceByUser.has(id)) return;
  try {
    await creditOpenSegment(id, Date.now());
  } finally {
    onlineSinceByUser.delete(id);
    lastCreditedByUser.delete(id);
  }
}

async function flushAllOpenSegments() {
  const now = Date.now();
  const ids = Array.from(onlineSinceByUser.keys());
  for (const id of ids) {
    try {
      await creditOpenSegment(id, now);
    } catch (err) {
      console.error("[onlineTime] flush failed:", err?.message || err);
    }
  }
}

function startOnlineTimeFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushAllOpenSegments();
  }, FLUSH_INTERVAL_MS);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

function stopOnlineTimeFlushTimer() {
  if (!flushTimer) return;
  clearInterval(flushTimer);
  flushTimer = null;
}

module.exports = {
  markUserOnline,
  markUserOffline,
  flushAllOpenSegments,
  startOnlineTimeFlushTimer,
  stopOnlineTimeFlushTimer,
  addOnlineMs,
  FLUSH_INTERVAL_MS,
};
