import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { syncCustomerLegFromTwilio } from "@/server/calls/callLegs";
import {
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

    const agentTwiml = buildConferenceTwiMl({
      conferenceName,
      participant: "agent",
      callerId: callerIdForConference,
    });
    const customerTwiml = buildConferenceTwiMl({
      conferenceName,
      participant: "customer",
      callerId: callerIdForConference,
    });

    const fallbackBaseUrl = getRequestBaseUrlFromRequest(req);
    const agentVoiceUrl =
      fallbackBaseUrl && buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "agent");
    const customerVoiceUrl =
      fallbackBaseUrl && buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "customer");

    // Agent (starts conference via startConferenceOnEnter) first, then customer joins.
    await redirectLegTwimlOrUrl(
      client,
      parentSid,
      agentTwiml,
      agentVoiceUrl || null,
      "agent-leg",
    );
    await redirectLegTwimlOrUrl(
      client,
      resolvedCustomerSid,
      customerTwiml,
      customerVoiceUrl || null,
      "customer-leg",
    );

    await call.update({ conferenceName });

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
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
