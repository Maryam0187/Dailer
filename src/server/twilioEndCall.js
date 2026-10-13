import { getTwilioClient } from "@/server/twilio";
import { getTwilioContextForUserId } from "@/server/twilio/callOwnerTwilio";

/**
 * Complete a Twilio call leg if it is still active (ignore 404/already completed).
 * @param {string} callSid
 * @param {import("twilio").Twilio} [client]
 */
export async function completeTwilioCallSid(callSid, client = null) {
  const sid = String(callSid || "").trim();
  if (!sid) return;
  try {
    const twilioClient = client || (await getTwilioClient());
    await twilioClient.calls(sid).update({ status: "completed" });
  } catch (err) {
    const code = err?.code ?? err?.status;
    if (code === 20404 || code === 404) return;
    throw err;
  }
}

/**
 * Hang up the parent outbound call and any tracked invite legs.
 * Uses the call owner's Twilio account when userId is present.
 * @param {object} call - CallLog instance with twilioSid / userId
 * @param {import("sequelize").Model[] | { callSid: string }[]} [inviteLegs]
 */
export async function endCallLegs(call, inviteLegs = []) {
  let client = null;
  const ownerId = Number(call?.userId);
  if (Number.isInteger(ownerId) && ownerId > 0) {
    try {
      const ctx = await getTwilioContextForUserId(ownerId);
      client = ctx.client;
    } catch {
      client = await getTwilioClient();
    }
  } else {
    client = await getTwilioClient();
  }

  await completeTwilioCallSid(call?.twilioSid, client);
  await completeTwilioCallSid(call?.customerCallSid, client);
  for (const leg of inviteLegs) {
    await completeTwilioCallSid(leg?.callSid, client);
  }
}
