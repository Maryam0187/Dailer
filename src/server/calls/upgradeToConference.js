import db from "@/server/db";
import { syncCustomerLegFromTwilio } from "@/server/calls/callLegs";
import {
  buildConferenceStatusCallbackUrl,
  buildConferenceTwiMl,
  buildConferenceVoiceUrl,
  createConferenceName,
  getDefaultTwilioCallerId,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";
import { getTwilioClient } from "@/server/twilio";

const TERMINAL_STATUSES = new Set([
  "completed",
  "canceled",
  "cancelled",
  "failed",
  "busy",
  "no-answer",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(status, error, extra = {}) {
  return { ok: false, status, error, ...extra };
}

function pickBestPstnChild(children) {
  let best = null;
  let bestScore = Infinity;
  let bestTs = -1;

  for (const c of children || []) {
    const to = String(c?.to || "").trim().toLowerCase();
    if (!to || to.startsWith("client:")) continue;
    const st = String(c?.status || "").toLowerCase();
    if (TERMINAL_STATUSES.has(st)) continue;

    const score =
      st === "in-progress" ? 0 : st === "ringing" ? 1 : st === "queued" ? 2 : st === "initiated" ? 3 : 8;
    const tsRaw = c?.dateCreated || c?.startTime;
    const ts = tsRaw ? new Date(tsRaw).getTime() : 0;

    if (score < bestScore || (score === bestScore && ts >= bestTs)) {
      bestScore = score;
      bestTs = ts;
      best = c;
    }
  }
  return best;
}

async function redirectLegTwimlOrUrl(client, sid, twiml, fallbackUrl, label) {
  try {
    await client.calls(sid).update({ twiml });
  } catch (e1) {
    if (!fallbackUrl) throw e1;
    try {
      await client.calls(sid).update({ url: fallbackUrl, method: "POST" });
    } catch (e2) {
      const hint = label ? `${label}: ` : "";
      throw new Error(
        `${hint}twiml failed (${String(e1?.message || e1)}); url fallback failed (${String(e2?.message || e2)})`,
      );
    }
  }
}

async function waitForRedirectableLegs(client, parentSid, customerSid, opts = {}) {
  const attempts = opts.attempts ?? 18;
  const delayMs = opts.delayMs ?? 450;

  let lastAgent = "?";
  let lastCustomer = "?";

  for (let i = 0; i < attempts; i++) {
    try {
      const [agentCall, custCall] = await Promise.all([
        client.calls(parentSid).fetch(),
        client.calls(customerSid).fetch(),
      ]);
      lastAgent = String(agentCall.status || "").toLowerCase();
      lastCustomer = String(custCall.status || "").toLowerCase();

      if (TERMINAL_STATUSES.has(lastAgent) || TERMINAL_STATUSES.has(lastCustomer)) {
        return {
          ok: false,
          agentStatus: lastAgent,
          customerStatus: lastCustomer,
          reason: "terminal",
        };
      }

      if (lastAgent === "in-progress" && lastCustomer === "in-progress") {
        return { ok: true, agentStatus: lastAgent, customerStatus: lastCustomer };
      }
    } catch {
      /* continue polling */
    }
    await sleep(delayMs);
  }

  return {
    ok: false,
    agentStatus: lastAgent,
    customerStatus: lastCustomer,
    reason: "not_ready",
  };
}

async function waitForConferenceCommitted(callRecord, conferenceNameExpected, opts = {}) {
  const deadlineMs = opts.deadlineMs ?? 14500;
  const delayMs = opts.delayMs ?? 350;

  const expected = String(conferenceNameExpected || "").trim();
  const deadline = Date.now() + deadlineMs;

  while (Date.now() < deadline) {
    await callRecord.reload({
      attributes: ["conferenceName", "pendingConferenceName"],
    });
    if (String(callRecord.conferenceName || "").trim() === expected) return true;
    await sleep(delayMs);
  }

  return false;
}

/**
 * Upgrade an outbound 1:1 call into a conference, or no-op if already conferenced.
 * @returns {{ ok: true, conferenceName: string, alreadyUpgraded: boolean, callMode: "conference" } | { ok: false, status: number, error: string, twilioHint?: string }}
 */
export async function upgradeCallToConference({ req, authedUser, callId }) {
  if (!authedUser) return fail(401, "Unauthorized");
  if (!Number.isInteger(callId) || callId <= 0) return fail(400, "Invalid call id");

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: [
      "id",
      "userId",
      "twilioSid",
      "customerCallSid",
      "conferenceName",
      "pendingConferenceName",
      "direction",
      "status",
      "fromNumber",
    ],
  });
  if (!call) return fail(404, "Call not found");

  if (call.userId !== authedUser.id) return fail(403, "Forbidden");

  const existingName = String(call.conferenceName || "").trim();
  if (existingName) {
    return {
      ok: true,
      alreadyUpgraded: true,
      conferenceName: existingName,
      callMode: "conference",
    };
  }

  if (call.direction !== "outbound") {
    return fail(400, "Only outbound calls can be upgraded");
  }

  const parentSid = String(call.twilioSid || "").trim();
  if (!parentSid) {
    return fail(409, "Call is not connected yet. Wait for your line to connect, then try again.");
  }

  if (String(call.pendingConferenceName || "").trim()) {
    return fail(
      409,
      "Conference upgrade is already running. Wait a few seconds or try once the room connects.",
    );
  }

  try {
    const client = getTwilioClient();

    await syncCustomerLegFromTwilio(call).catch(() => {});

    const childrenList = await client.calls.list({ parentCallSid: parentSid, limit: 35 });
    const pickedChild = pickBestPstnChild(childrenList);
    let resolvedCustomerSid = String(call.customerCallSid || "").trim();
    if (pickedChild?.sid) {
      resolvedCustomerSid = String(pickedChild.sid || "").trim();
      if (resolvedCustomerSid && resolvedCustomerSid !== String(call.customerCallSid || "").trim()) {
        await call.update({ customerCallSid: resolvedCustomerSid }).catch(() => {});
      }
    }

    if (!resolvedCustomerSid) {
      return fail(409, "Customer is not on the line yet. Wait until they answer, then enable conference mode.");
    }

    const ready = await waitForRedirectableLegs(client, parentSid, resolvedCustomerSid);
    if (!ready.ok) {
      if (ready.reason === "terminal") {
        return fail(
          409,
          "This call has already ended or cannot be moved to conference anymore. Place a new call first.",
        );
      }

      let msg =
        "Both lines must be live (in-progress). Wait until you and the customer are connected, then try again.";
      if (ready.customerStatus === "ringing" && ready.agentStatus === "in-progress") {
        msg = "Customer phone is still ringing. Wait until they answer, then enable conference mode.";
      } else if (ready.agentStatus !== "in-progress") {
        msg =
          "Agent line is not in-progress yet. Accept the incoming browser call fully, then enable conference.";
      } else if (ready.customerStatus === "queued") {
        msg = "Customer line is still connecting. Wait a few seconds after they answer and try again.";
      }

      return fail(409, msg, {
        twilioHint: `agent=${ready.agentStatus} customer=${ready.customerStatus}`,
      });
    }

    const conferenceName = createConferenceName({ userId: authedUser.id });
    const callerIdForConference = String(call.fromNumber || "").trim() || getDefaultTwilioCallerId();

    const fallbackBaseUrl = getRequestBaseUrlFromRequest(req);
    const conferenceStatusCb = fallbackBaseUrl
      ? buildConferenceStatusCallbackUrl(fallbackBaseUrl)
      : "";

    const customerTwiml = buildConferenceTwiMl({
      conferenceName,
      participant: "customer",
      callerId: callerIdForConference,
      statusCallbackUrl: conferenceStatusCb || undefined,
    });

    const customerVoiceUrl =
      fallbackBaseUrl && buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "customer");

    await call.update({ pendingConferenceName: conferenceName });

    await redirectLegTwimlOrUrl(
      client,
      resolvedCustomerSid,
      customerTwiml,
      customerVoiceUrl || null,
      "customer-leg",
    );

    const committed = await waitForConferenceCommitted(call, conferenceName);
    if (!committed) {
      await db.CallLog.update({ pendingConferenceName: null }, { where: { id: callId } });
      await call.reload({
        attributes: ["conferenceName", "pendingConferenceName"],
      });
      const currentName = String(call.conferenceName || "").trim();
      if (currentName === conferenceName) {
        return {
          ok: true,
          alreadyUpgraded: false,
          conferenceName: currentName,
          callMode: "conference",
        };
      }
      return fail(
        504,
        "Conference upgrade did not confirm before the deadline — hang up both sides if you lost audio, then try again. If Dial webhooks failed, check your Twilio status callback URLs.",
      );
    }

    return {
      ok: true,
      alreadyUpgraded: false,
      conferenceName,
      callMode: "conference",
    };
  } catch (err) {
    const raw = String(err?.message || err || "").toLowerCase();
    let message = err?.message || "Failed to upgrade call to conference";
    if (raw.includes("not in-progress") || raw.includes("cannot redirect")) {
      message =
        "Conference upgrade failed: Twilio could not reroute both legs yet. Hang up and start a conference-style call instead, or try again shortly after talking for a few seconds.";
    }
    await db.CallLog.update({ pendingConferenceName: null }, { where: { id: callId } });
    return fail(502, message);
  }
}

export async function waitForInProgressConference(client, conferenceName, opts = {}) {
  const attempts = opts.attempts ?? 20;
  const delayMs = opts.delayMs ?? 400;
  const name = String(conferenceName || "").trim();
  if (!name) return null;

  for (let i = 0; i < attempts; i++) {
    const matches = await client.conferences.list({
      friendlyName: name,
      status: "in-progress",
      limit: 1,
    });
    if (matches.length) return matches[0];
    await sleep(delayMs);
  }
  return null;
}
