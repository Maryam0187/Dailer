"use strict";

const { Op } = require("sequelize");
const twilio = require("twilio");
const db = require("../../../models");

const ACTIVE_CALL_STATUSES = ["queued", "ringing", "in-progress", "initiated", "answered"];
const TWILIO_ACTIVE = new Set(ACTIVE_CALL_STATUSES);
const TWILIO_TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "canceled", "cancelled"]);

const ORPHAN_ACTIVE_GRACE_MS = 5 * 60 * 1000;
const STALE_ACTIVE_FALLBACK_MS = 60 * 60 * 1000;

function getTwilioClient() {
  const isTestMode =
    process.env.NODE_ENV === "development" || process.env.TWILIO_TEST_MODE === "true";

  const accountSid = isTestMode
    ? process.env.TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID
    : process.env.TWILIO_ACCOUNT_SID;
  const authToken = isTestMode
    ? process.env.TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN
    : process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

function rowAgeMs(row) {
  const touched = row?.updatedAt || row?.createdAt;
  if (!touched) return Infinity;
  return Date.now() - new Date(touched).getTime();
}

async function fetchTwilioCallStatus(callSid) {
  const sid = String(callSid || "").trim();
  if (!sid) return null;
  try {
    const client = getTwilioClient();
    if (!client) return null;
    const call = await client.calls(sid).fetch();
    return String(call.status || "").toLowerCase();
  } catch (err) {
    if (err?.status === 404) return "completed";
    return null;
  }
}

async function finalizeCallLogStatus(call, status) {
  const next = String(status || "completed").toLowerCase();
  if (!TWILIO_TERMINAL.has(next) && next !== "completed") return;
  await call.update({ status: next === "cancelled" ? "canceled" : next }).catch(() => {});
}

async function isOwnedCallActiveForUser(call) {
  const agentSid = String(call.twilioSid || "").trim();
  if (!agentSid) {
    if (rowAgeMs(call) > ORPHAN_ACTIVE_GRACE_MS) {
      await finalizeCallLogStatus(call, "failed");
      return false;
    }
    return true;
  }

  const agentStatus = await fetchTwilioCallStatus(agentSid);
  if (agentStatus && TWILIO_ACTIVE.has(agentStatus)) return true;

  if (agentStatus && TWILIO_TERMINAL.has(agentStatus)) {
    await finalizeCallLogStatus(call, agentStatus);
    return false;
  }

  if (agentStatus === "completed") {
    await finalizeCallLogStatus(call, "completed");
    return false;
  }

  if (rowAgeMs(call) > STALE_ACTIVE_FALLBACK_MS) {
    await finalizeCallLogStatus(call, "completed");
    return false;
  }

  return ACTIVE_CALL_STATUSES.includes(String(call.status || "").toLowerCase());
}

async function isInviteLegActiveForUser(leg) {
  const inviteSid = String(leg.callSid || "").trim();
  if (!inviteSid) return false;

  const inviteStatus = await fetchTwilioCallStatus(inviteSid);
  if (inviteStatus && TWILIO_ACTIVE.has(inviteStatus)) return true;
  if (inviteStatus && TWILIO_TERMINAL.has(inviteStatus)) return false;
  if (inviteStatus === "completed") return false;

  if (rowAgeMs(leg) > STALE_ACTIVE_FALLBACK_MS) return false;

  return false;
}

async function userHasActiveCall(userId) {
  if (!userId) return false;

  const owned = await db.CallLog.findOne({
    where: {
      userId,
      status: { [Op.in]: ACTIVE_CALL_STATUSES },
    },
  });
  if (owned && (await isOwnedCallActiveForUser(owned))) return true;

  const invitedLegs = await db.InviteDialLeg.findAll({
    where: { invitedUserId: userId },
    include: [
      {
        model: db.CallLog,
        required: true,
        where: {
          status: { [Op.in]: ACTIVE_CALL_STATUSES },
        },
      },
    ],
  });

  for (const leg of invitedLegs) {
    if (await isInviteLegActiveForUser(leg)) return true;
  }

  return false;
}

module.exports = {
  userHasActiveCall,
};
