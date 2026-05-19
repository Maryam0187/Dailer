import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { findCustomerDialChild, syncCustomerLegFromTwilio } from "@/server/calls/callLegs";
import {
  buildConferenceVoiceUrl,
  createConferenceName,
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

/**
 * Twilio only allows REST `calls.update({ url })` while the Call leg status is **in-progress**.
 * The Dial child stays **ringing** until the callee answers — then redirect succeeds.
 *
 * Poll briefly so UX can tap "Enable conference" slightly before Twilio finishes the handshake.
 */
async function waitForRedirectableLegs(client, parentSid, customerSid, opts = {}) {
  const attempts = opts.attempts ?? 14;
  const delayMs = opts.delayMs ?? 400;

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

  const fallbackBaseUrl = getRequestBaseUrlFromRequest(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio voice webhook" },
      { status: 500 },
    );
  }

  try {
    const client = getTwilioClient();
    let customerSid = String(call.customerCallSid || "").trim();
    if (!customerSid) {
      const synced = await syncCustomerLegFromTwilio(call);
      customerSid = String(synced?.customerCallSid || "").trim();
    }
    if (!customerSid) {
      const customerChild = await findCustomerDialChild(client, parentSid);
      customerSid = String(customerChild?.sid || "").trim();
      if (customerSid) {
        await call.update({ customerCallSid: customerSid });
      }
    }
    if (!customerSid) {
      return NextResponse.json(
        {
          error:
            "Customer is not on the line yet. Wait until they answer, then enable conference mode.",
        },
        { status: 409 },
      );
    }

    const ready = await waitForRedirectableLegs(client, parentSid, customerSid);
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
    const agentVoiceUrl = buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "agent");
    const customerVoiceUrl = buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "customer");

    await client.calls(parentSid).update({ url: agentVoiceUrl, method: "POST" });
    await client.calls(customerSid).update({ url: customerVoiceUrl, method: "POST" });

    await call.update({ conferenceName });

    return NextResponse.json({
      ok: true,
      alreadyUpgraded: false,
      conferenceName,
      callMode: "conference",
    });
  } catch (err) {
    const raw = String(err?.message || err || "").toLowerCase();
    let message =
      err?.message || "Failed to upgrade call to conference";
    if (raw.includes("not in-progress") || raw.includes("cannot redirect")) {
      message =
        "Twilio could not redirect this call yet. Wait until both you and the customer are fully connected (not ringing), then try again.";
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
