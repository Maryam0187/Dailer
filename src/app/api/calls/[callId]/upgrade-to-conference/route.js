import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
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

export const runtime = "nodejs";

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

/** Best-effort outbound PSTN child under Client parent (handles stale stored customerCallSid). */
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

/**
 * Twilio only allows REST redirects while legs are usable; Dial child stays ringing until pickup.
 */
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

/** Dial action webhook persists `conferenceName` once the agent leg executes conference TwiML. */
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

export async function POST(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { callId: rawCallId } = await params;
  const callId = Number(rawCallId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }

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
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (call.direction !== "outbound") {
    return NextResponse.json({ error: "Only outbound calls can be upgraded" }, { status: 400 });
  }

  const parentSid = String(call.twilioSid || "").trim();
  if (!parentSid) {
    return NextResponse.json(
      { error: "Call is not connected yet. Wait for your line to connect, then try again." },
      { status: 409 },
    );
  }

  const existingName = String(call.conferenceName || "").trim();
  if (existingName) {
    return NextResponse.json({
      ok: true,
      alreadyUpgraded: true,
      conferenceName: existingName,
      callMode: "conference",
    });
  }

  if (String(call.pendingConferenceName || "").trim()) {
    return NextResponse.json(
      {
        error:
          "Conference upgrade is already running. Wait a few seconds or try once the room connects.",
      },
      { status: 409 },
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
      if (
        resolvedCustomerSid &&
        resolvedCustomerSid !== String(call.customerCallSid || "").trim()
      ) {
        await call.update({ customerCallSid: resolvedCustomerSid }).catch(() => {});
      }
    }

    if (!resolvedCustomerSid) {
      return NextResponse.json(
        {
          error:
            "Customer is not on the line yet. Wait until they answer, then enable conference mode.",
        },
        { status: 409 },
      );
    }

    const ready = await waitForRedirectableLegs(client, parentSid, resolvedCustomerSid);
    if (!ready.ok) {
      if (ready.reason === "terminal") {
        return NextResponse.json(
          {
            error:
              "This call has already ended or cannot be moved to conference anymore. Place a new call first.",
          },
          { status: 409 },
        );
      }

      let msg =
        "Both lines must be live (in-progress). Wait until you and the customer are connected, then try again.";
      if (ready.customerStatus === "ringing" && ready.agentStatus === "in-progress") {
        msg =
          "Customer phone is still ringing. Wait until they answer, then enable conference mode.";
      } else if (ready.agentStatus !== "in-progress") {
        msg =
          "Agent line is not in-progress yet. Accept the incoming browser call fully, then enable conference.";
      } else if (ready.customerStatus === "queued") {
        msg =
          "Customer line is still connecting. Wait a few seconds after they answer and try again.";
      }

      return NextResponse.json(
        {
          error: msg,
          twilioHint: `agent=${ready.agentStatus} customer=${ready.customerStatus}`,
        },
        { status: 409 },
      );
    }

    const conferenceName = createConferenceName({ userId: authedUser.id });
    const callerIdForConference =
      String(call.fromNumber || "").trim() || getDefaultTwilioCallerId();

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

    /**
     * Do NOT REST-redirect the agent (parent Dial) before the PSTN leg — it tears down &lt;Dial&gt;
     * and disconnects the customer. Set pendingConferenceName, redirect the customer first, then the
     * Dial `action` webhook returns conference TwiML for the agent leg.
     */
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
      await db.CallLog.update(
        { pendingConferenceName: null },
        { where: { id: callId } },
      );
      await call.reload({
        attributes: ["conferenceName", "pendingConferenceName"],
      });
      let message =
        "Conference upgrade did not confirm before the deadline — hang up both sides if you lost audio, then try again. If Dial webhooks failed, check your Twilio status callback URLs.";
      const currentName = String(call.conferenceName || "").trim();
      if (currentName === conferenceName) {
        /** Dial action won the race near the timeout; treat as OK. */
        return NextResponse.json({
          ok: true,
          alreadyUpgraded: false,
          conferenceName: currentName,
          callMode: "conference",
        });
      }
      return NextResponse.json({ error: message }, { status: 504 });
    }

    return NextResponse.json({
      ok: true,
      alreadyUpgraded: false,
      conferenceName,
      callMode: "conference",
    });
  } catch (err) {
    const raw = String(err?.message || err || "").toLowerCase();
    let message = err?.message || "Failed to upgrade call to conference";
    if (raw.includes("not in-progress") || raw.includes("cannot redirect")) {
      message =
        "Conference upgrade failed: Twilio could not reroute both legs yet. Hang up and start a conference-style call instead, or try again shortly after talking for a few seconds.";
    }
    await db.CallLog.update(
      { pendingConferenceName: null },
      { where: { id: callId } },
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
