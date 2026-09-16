import { ADDRESS_BOT_LABEL } from "@/server/calls/addressBot";
import { getTwilioFromNumber } from "@/server/twilio";

const ADDRESS_BOT_APP_NAME = "dialer-address-bot";

export async function findLabeledParticipant(client, conferenceSid, label) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!conferenceSid || !wanted) return null;
  const participants = await client.conferences(conferenceSid).participants.list({ limit: 50 });
  return participants.find((p) => String(p.label || "").trim().toLowerCase() === wanted) || null;
}

export async function removeLabeledParticipant(client, conferenceSid, label) {
  const match = await findLabeledParticipant(client, conferenceSid, label);
  if (!match?.callSid) return;
  await client.conferences(conferenceSid).participants(match.callSid).remove().catch(() => {});
}

export async function ensureAddressBotTwimlApp(client, origin) {
  const voiceUrl = `${String(origin || "").replace(/\/$/, "")}/api/twilio/address-bot/voice`;
  const envSid = String(process.env.TWILIO_ADDRESS_BOT_APP_SID || "").trim();
  const mainAppSid = String(process.env.TWILIO_APP_SID || "").trim();

  let sid = envSid;
  if (!sid) {
    const existing = await client.applications.list({
      friendlyName: ADDRESS_BOT_APP_NAME,
      limit: 20,
    });
    const match = existing.find((app) => app?.sid && app.sid !== mainAppSid);
    sid = match?.sid || "";
  }
  if (sid && sid === mainAppSid) {
    throw new Error("Address bot cannot use TWILIO_APP_SID. Set TWILIO_ADDRESS_BOT_APP_SID.");
  }

  if (sid) {
    await client.applications(sid).update({ voiceUrl, voiceMethod: "POST" });
    return sid;
  }

  const created = await client.applications.create({
    friendlyName: ADDRESS_BOT_APP_NAME,
    voiceUrl,
    voiceMethod: "POST",
  });
  return created.sid;
}

export async function addMutedAddressBot({ client, conferenceSid, origin, callId }) {
  const appSid = await ensureAddressBotTwimlApp(client, origin);
  const to = `app:${appSid}?${new URLSearchParams({
    callId: String(callId),
  }).toString()}`;

  return client.conferences(conferenceSid).participants.create({
    from: getTwilioFromNumber(),
    to,
    label: ADDRESS_BOT_LABEL,
    muted: true,
    earlyMedia: false,
    endConferenceOnExit: false,
    beep: false,
  });
}

export async function setAddressBotMuted(client, conferenceSid, muted) {
  const bot = await findLabeledParticipant(client, conferenceSid, ADDRESS_BOT_LABEL);
  if (!bot?.callSid) return null;
  await client.conferences(conferenceSid).participants(bot.callSid).update({ muted: Boolean(muted) });
  return bot;
}
