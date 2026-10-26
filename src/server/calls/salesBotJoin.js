import { SALES_BOT_LABEL } from "@/server/calls/salesBot";
import { getTwilioFromNumber } from "@/server/twilio";

const SALES_BOT_APP_NAME = "dialer-sales-bot";

async function twilioFormPost(client, path, fields) {
  const accountSid = String(client.accountSid || "").trim();
  const authToken = String(client.password || "").trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}${path}`;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error_message || `Twilio request failed (${res.status})`);
  }
  return json;
}

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

export async function ensureSalesBotTwimlApp(client, origin) {
  const voiceUrl = `${String(origin || "").replace(/\/$/, "")}/api/twilio/sales-bot/voice`;
  const envSid = String(process.env.TWILIO_SALES_BOT_APP_SID || "").trim();
  const mainAppSid = String(process.env.TWILIO_APP_SID || "").trim();
  const addressBotSid = String(process.env.TWILIO_ADDRESS_BOT_APP_SID || "").trim();

  let sid = envSid;
  if (!sid) {
    const existing = await client.applications.list({
      friendlyName: SALES_BOT_APP_NAME,
      limit: 20,
    });
    const match = existing.find(
      (app) => app?.sid && app.sid !== mainAppSid && app.sid !== addressBotSid,
    );
    sid = match?.sid || "";
  }
  if (sid && (sid === mainAppSid || sid === addressBotSid)) {
    throw new Error("Sales bot cannot use TWILIO_APP_SID or TWILIO_ADDRESS_BOT_APP_SID. Set TWILIO_SALES_BOT_APP_SID.");
  }

  if (sid) {
    await client.applications(sid).update({ voiceUrl, voiceMethod: "POST" });
    return sid;
  }

  const created = await client.applications.create({
    friendlyName: SALES_BOT_APP_NAME,
    voiceUrl,
    voiceMethod: "POST",
  });
  return created.sid;
}

/** Add AI bot unmuted so it can speak from the start of the call. */
export async function addSpeakingSalesBot({ client, conferenceSid, origin, callId }) {
  const appSid = await ensureSalesBotTwimlApp(client, origin);
  const to = `app:${appSid}?${new URLSearchParams({
    callId: String(callId),
  }).toString()}`;

  const json = await twilioFormPost(
    client,
    `/Conferences/${encodeURIComponent(conferenceSid)}/Participants.json`,
    {
      From: await getTwilioFromNumber(),
      To: to,
      Label: SALES_BOT_LABEL,
      Muted: "false",
      EarlyMedia: "false",
      EndConferenceOnExit: "false",
      Beep: "false",
    },
  );

  return {
    callSid: json.call_sid || json.callSid || null,
    ...json,
  };
}

export async function addCustomerToConference({
  client,
  conferenceSid,
  toNumber,
  fromNumber,
  endConferenceOnExit = true,
}) {
  const json = await twilioFormPost(
    client,
    `/Conferences/${encodeURIComponent(conferenceSid)}/Participants.json`,
    {
      From: fromNumber,
      To: toNumber,
      Label: "customer",
      Muted: "false",
      EarlyMedia: "true",
      EndConferenceOnExit: endConferenceOnExit ? "true" : "false",
      Beep: "false",
    },
  );

  return {
    callSid: json.call_sid || json.callSid || null,
    ...json,
  };
}

export { twilioFormPost };
