import db from "@/server/db";
import { getTwilioClient, getTwilioCredentials } from "@/server/twilio";

const ACTIVE_RECORDING_STATUSES = new Set(["in-progress", "paused"]);

export function isRecordingDownloadable(status) {
  return String(status || "").toLowerCase() === "completed";
}

/**
 * Stop an in-progress or paused Twilio call recording so media can be processed.
 * Safe to call when the call is ending or has ended.
 */
export async function finalizeCallRecording(callLog) {
  if (!callLog) return { ok: false, reason: "missing_call" };

  const recordingSid = String(callLog.recordingSid || "").trim();
  const callSid = String(callLog.twilioSid || "").trim();
  const status = String(callLog.recordingStatus || "").toLowerCase();

  if (!recordingSid) return { ok: false, reason: "no_recording" };
  if (isRecordingDownloadable(status) || status === "absent") {
    return { ok: true, status, alreadyFinal: true };
  }
  if (!callSid) return { ok: false, reason: "missing_call_sid" };
  if (!ACTIVE_RECORDING_STATUSES.has(status)) {
    return { ok: true, status, skipped: true };
  }

  try {
    const client = getTwilioClient();
    const recording = await client
      .calls(callSid)
      .recordings(recordingSid)
      .update({ status: "stopped" });

    const nextStatus = String(recording.status || "stopped").toLowerCase();
    await db.CallLog.update({ recordingStatus: nextStatus }, { where: { id: callLog.id } });
    return { ok: true, status: nextStatus, finalized: true };
  } catch (err) {
    const code = err?.code ?? err?.status;
    if (code === 20404 || code === 404) {
      return { ok: false, reason: "recording_not_found", error: err?.message };
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch recording metadata; optionally poll until Twilio marks it completed.
 */
export async function waitForCompletedRecording(recordingSid, { maxAttempts = 6, delayMs = 1500 } = {}) {
  const client = getTwilioClient();
  let last = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await client.recordings(recordingSid).fetch();
    const status = String(last.status || "").toLowerCase();
    if (status === "completed") return last;
    if (status === "absent" || status === "failed") {
      throw new Error(`Recording is ${status} and cannot be downloaded`);
    }
    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }

  throw new Error(
    `Recording is still processing (status: ${last?.status || "unknown"}). Try again in a few seconds.`,
  );
}

/**
 * Download recording bytes from Twilio.
 */
export async function downloadRecordingBytes(recordingSid) {
  const recording = await waitForCompletedRecording(recordingSid);

  const { accountSid, authToken } = getTwilioCredentials();
  const uri = String(recording.uri || "").replace(/\.json$/i, ".mp3");
  const mediaPath = uri.startsWith("/") ? uri : `/${uri}`;
  const mediaUrl = `https://api.twilio.com${mediaPath}`;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: "follow",
  });

  if (!res.ok) {
    const fallbackUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Authorization: `Basic ${auth}` },
      redirect: "follow",
    });
    if (!fallbackRes.ok) {
      throw new Error(`Recording media unavailable (${fallbackRes.status})`);
    }
    return {
      buffer: Buffer.from(await fallbackRes.arrayBuffer()),
      contentType: fallbackRes.headers.get("content-type") || "audio/mpeg",
    };
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "audio/mpeg",
  };
}
