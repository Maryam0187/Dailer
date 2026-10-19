"use strict";

/**
 * Accumulate Socket.IO online time into AttendanceDailyRecords.
 * Tracks per-user + device-bucket (desktop | mobile) open intervals in memory;
 * flushes on disconnect and on a timer so crashes only lose up to one flush window.
 *
 * `onlineMs` stays the combined total (agent profile). Desktop/mobile columns are admin-facing.
 */

const db = require("../../../models");
const { getSessionCalendarDate } = require("../auth/loginWindow.core.cjs");
const {
  onlineTimeDeviceBucket,
} = require("../activity/resolveDeviceType.core.cjs");

const FLUSH_INTERVAL_MS = 60 * 1000;
const MAX_SEGMENT_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, number>} "userId:device" -> ms when they went 0→1 online for that bucket */
const onlineSinceByKey = new Map();
/** @type {Map<string, number>} "userId:device" -> ms last credited to DB while still online */
const lastCreditedByKey = new Map();

let flushTimer = null;

function presenceKey(userId, deviceBucket) {
  const bucket = onlineTimeDeviceBucket(deviceBucket);
  return `${Number(userId)}:${bucket}`;
}

function parsePresenceKey(key) {
  const [idPart, bucket] = String(key).split(":");
  return { userId: Number(idPart), deviceBucket: bucket === "mobile" ? "mobile" : "desktop" };
}

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
 * Add deltaMs to the daily aggregate for the calendar day of `at`, split by device.
 * @param {"desktop"|"mobile"|string} deviceBucket
 */
async function addOnlineMs(userId, deltaMs, at = new Date(), deviceBucket = "desktop") {
  const id = Number(userId);
  const delta = clampDelta(deltaMs);
  if (!Number.isInteger(id) || id <= 0 || delta <= 0) return;

  const bucket = onlineTimeDeviceBucket(deviceBucket);
  const deviceField = bucket === "mobile" ? "mobileOnlineMs" : "desktopOnlineMs";

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
        desktopOnlineMs: 0,
        mobileOnlineMs: 0,
      },
    });
    await record.increment({
      onlineMs: delta,
      [deviceField]: delta,
    });
  } catch (err) {
    console.error("[onlineTime] increment failed:", err?.message || err);
  }
}

async function creditOpenSegment(key, nowMs = Date.now()) {
  if (!onlineSinceByKey.has(key)) return;

  const { userId, deviceBucket } = parsePresenceKey(key);
  if (!Number.isInteger(userId) || userId <= 0) return;

  const last = lastCreditedByKey.get(key) ?? onlineSinceByKey.get(key);
  const delta = nowMs - last;
  if (delta > 0) {
    await addOnlineMs(userId, delta, new Date(last), deviceBucket);
  }
  lastCreditedByKey.set(key, nowMs);
}

/**
 * Call when socket count for this user+device goes 0 → 1.
 * @param {number} userId
 * @param {"desktop"|"mobile"|string} [deviceBucket]
 */
function markUserOnline(userId, deviceBucket = "desktop") {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  const key = presenceKey(id, deviceBucket);
  if (onlineSinceByKey.has(key)) return;
  const now = Date.now();
  onlineSinceByKey.set(key, now);
  lastCreditedByKey.set(key, now);
}

/**
 * Call when socket count for this user+device goes → 0. Credits remaining open time.
 * @param {number} userId
 * @param {"desktop"|"mobile"|string} [deviceBucket]
 */
async function markUserOffline(userId, deviceBucket = "desktop") {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  const key = presenceKey(id, deviceBucket);
  if (!onlineSinceByKey.has(key)) return;
  try {
    await creditOpenSegment(key, Date.now());
  } finally {
    onlineSinceByKey.delete(key);
    lastCreditedByKey.delete(key);
  }
}

async function flushAllOpenSegments() {
  const now = Date.now();
  const keys = Array.from(onlineSinceByKey.keys());
  for (const key of keys) {
    try {
      await creditOpenSegment(key, now);
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
