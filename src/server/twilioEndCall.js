import { getTwilioClient } from "@/server/twilio";

/**
 * Complete a Twilio call leg if it is still active (ignore 404/already completed).
 * @param {string} callSid
 */
export async function completeTwilioCallSid(callSid) {
  const sid = String(callSid || "").trim();
  if (!sid) return;
  try {
    const client = getTwilioClient();
    await client.calls(sid).update({ status: "completed" });
  } catch (err) {
    const code = err?.code ?? err?.status;
    if (code === 20404 || code === 404) return;
    throw err;
  }
}

/**
 * Hang up the parent outbound call and any tracked invite legs.
 * @param {object} call - CallLog instance with twilioSid
 * @param {import("sequelize").Model[] | { callSid: string }[]} [inviteLegs]
 */
export async function endCallLegs(call, inviteLegs = []) {
  await completeTwilioCallSid(call?.twilioSid);
  await completeTwilioCallSid(call?.customerCallSid);
  for (const leg of inviteLegs) {
    await completeTwilioCallSid(leg?.callSid);
  }
}
