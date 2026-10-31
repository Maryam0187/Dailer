"use strict";

/**
 * Accumulate active attendance time into AttendanceDailyRecords.
 * An open socket only means the user is reachable. The browser starts a segment
 * once, keeps a local idle timer, and sends pause when that timer runs out.
 * The server keeps crediting an open segment until pause or disconnect.
 * Flushes on pause, disconnect, and a timer so crashes only lose up to one flush window.
 *
 * `onlineMs` stays the combined total (agent profile). Desktop/mobile columns are admin-facing.
 */

const { Op } = require("sequelize");
const db = require("../../../models");
const { getSessionCalendarDate } = require("../auth/loginWindow.core.cjs");
const {
  onlineTimeDeviceBucket,
} = require("../activity/resolveDeviceType.core.cjs");

const FLUSH_INTERVAL_MS = 60 * 1000;
const MAX_SEGMENT_MS = 6 * 60 * 60 * 1000;
const ACTIVE_CALL_STATUSES = ["queued", "ringing", "in-progress", "initiated", "answered"];

/** @type {Map<string, number>} "userId:device" -> ms when the current active segment started */
const onlineSinceByKey = new Map();
/** @type {Map<string, number>} "userId:device" -> ms last credited to DB while the segment is open */
const lastCreditedByKey = new Map();
/** @type {Map<string, number>} "userId:device" -> ms of the latest activity heartbeat */
const lastActivityByKey = new Map();

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

async function userHasOpenCall(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;

  const owned = await db.CallLog.findOne({
    where: { userId: id, status: { [Op.in]: ACTIVE_CALL_STATUSES } },
    attributes: ["id"],
  });
  if (owned) return true;

  const leg = await db.InviteDialLeg.findOne({
    where: { invitedUserId: id },
    attributes: ["callSid"],
    include: [
      {
        model: db.CallLog,
        required: true,
        attributes: ["id"],
        where: { status: { [Op.in]: ACTIVE_CALL_STATUSES } },
      },
    ],
  });
  return Boolean(leg);
}

/**
 * Credit elapsed time, then advance the cursor before the DB write so a
 * concurrent pause/disconnect cannot add the same span twice.
 */
async function creditOpenSegment(key, nowMs = Date.now()) {
  if (!onlineSinceByKey.has(key)) return;

  const { userId, deviceBucket } = parsePresenceKey(key);
  if (!Number.isInteger(userId) || userId <= 0) return;

  const last = lastCreditedByKey.get(key) ?? onlineSinceByKey.get(key);
  const delta = nowMs - last;
  if (delta <= 0) return;

  lastCreditedByKey.set(key, nowMs);
  await addOnlineMs(userId, delta, new Date(last), deviceBucket);
}

function clearSegment(key) {
  onlineSinceByKey.delete(key);
  lastCreditedByKey.delete(key);
  lastActivityByKey.delete(key);
}

async function closeSegment(key, untilMs = Date.now()) {
  if (!onlineSinceByKey.has(key)) return;
  const { userId, deviceBucket } = parsePresenceKey(key);
  const last = lastCreditedByKey.get(key) ?? onlineSinceByKey.get(key);
  clearSegment(key);
  if (!Number.isInteger(userId) || userId <= 0) return;
  const delta = untilMs - last;
  if (delta <= 0) return;
  await addOnlineMs(userId, delta, new Date(last), deviceBucket);
}

/**
 * Socket connect no longer starts the attendance clock. One activity message does.
 * @param {number} userId
 * @param {"desktop"|"mobile"|string} [deviceBucket]
 * @param {number} [nowMs]
 */
function noteUserActivity(userId, deviceBucket = "desktop", nowMs = Date.now()) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  const key = presenceKey(id, deviceBucket);
  lastActivityByKey.set(key, nowMs);
  if (onlineSinceByKey.has(key)) return;
  onlineSinceByKey.set(key, nowMs);
  lastCreditedByKey.set(key, nowMs);
}

/**
 * Tab hidden or idle. Keeps the segment open while a call is still in progress.
 * @param {number} userId
 * @param {"desktop"|"mobile"|string} [deviceBucket]
 * @param {number} [nowMs]
 */
async function pauseUserActivity(userId, deviceBucket = "desktop", nowMs = Date.now()) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  const key = presenceKey(id, deviceBucket);
  if (!onlineSinceByKey.has(key)) return;

  try {
    if (await userHasOpenCall(id)) return;
  } catch (err) {
    console.error("[onlineTime] call check failed:", err?.message || err);
    return;
  }

  await closeSegment(key, nowMs);
}

/**
 * Call when socket count for this user+device goes → 0. Credits remaining open time.
 * @param {number} userId
 * @param {"desktop"|"mobile"|string} [deviceBucket]
 */
async function markUserOffline(userId, deviceBucket = "desktop") {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  await closeSegment(presenceKey(id, deviceBucket), Date.now());
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
  markUserOffline,
  noteUserActivity,
  pauseUserActivity,
  flushAllOpenSegments,
  startOnlineTimeFlushTimer,
  stopOnlineTimeFlushTimer,
  addOnlineMs,
  FLUSH_INTERVAL_MS,
};
