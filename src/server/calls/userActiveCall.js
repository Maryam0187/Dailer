import { Op } from "sequelize";
import db from "@/server/db";
import { getTwilioClient } from "@/server/twilio";

const ACTIVE_CALL_STATUSES = ["queued", "ringing", "in-progress", "initiated", "answered"];
const TWILIO_ACTIVE = new Set(ACTIVE_CALL_STATUSES);
const TWILIO_TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "canceled", "cancelled"]);

const ORPHAN_ACTIVE_GRACE_MS = 5 * 60 * 1000;
const STALE_ACTIVE_FALLBACK_MS = 60 * 60 * 1000;

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

/**
 * True only when this user's agent (browser) leg is still live in Twilio.
 * Customer/PSTN legs alone do not block logout once the agent has disconnected.
 */
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

  // Twilio unreachable — fall back to DB status so we do not drop a live call mid-conversation.
  return ACTIVE_CALL_STATUSES.includes(String(call.status || "").toLowerCase());
}

/**
 * True only when this invitee's own dial leg is still live in Twilio.
 * Parent conference calls may continue after an invited agent leaves.
 */
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

export async function userHasActiveCall(userId) {
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
