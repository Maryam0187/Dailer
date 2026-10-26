import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { beginSalesBotSpeech, getOpenAiApiKey, waitForSalesBotSession } from "@/server/calls/salesBot";
import {
  addCustomerToConference,
  addSpeakingSalesBot,
  removeLabeledParticipant,
} from "@/server/calls/salesBotJoin";
import { SALES_BOT_LABEL } from "@/server/calls/salesBot";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import {
  buildConferenceStatusCallbackUrl,
  buildConferenceTwiMl,
  createConferenceName,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";
import { getTwilioStatusCallbackParamsWithFallback } from "@/server/twilio";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";
import {
  resolveDialUser,
  getTeamTwilioContext,
  resolveFromNumberLine1,
} from "@/server/twilio/callOwnerTwilio";
import { waitForInProgressConference } from "@/server/calls/upgradeToConference";

export const runtime = "nodejs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  if (!getOpenAiApiKey()) {
    return NextResponse.json(
      { error: "Sales bot is not configured (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const normalizedToNumber = normalizeToE164(body?.toNumber);
  if (!normalizedToNumber) {
    return NextResponse.json({ error: "A valid toNumber is required" }, { status: 400 });
  }

  const origin = getRequestBaseUrlFromRequest(req);
  if (!origin) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio webhooks." },
      { status: 500 },
    );
  }

  const dialUser = await resolveDialUser(authedUser);
  if (!dialUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  let ctx;
  let fromNumber;
  try {
    ctx = await getTeamTwilioContext(dialUser);
    fromNumber = await resolveFromNumberLine1(dialUser, ctx);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Twilio From number is not configured for this user" },
      { status: 400 },
    );
  }

  const conferenceName = createConferenceName({ userId: authedUser.id });
  const call = await db.CallLog.create({
    userId: authedUser.id,
    leadId: null,
    fromNumber,
    toNumber: normalizedToNumber,
    direction: "outbound",
    status: "initiated",
    callKind: "sales_bot",
    dialMode: "sales_bot",
    conferenceName,
    contactName: null,
    twilioSid: null,
    durationSeconds: null,
  });

  const client = ctx.client;
  const clientIdentity = getAgentClientIdentity(authedUser.id, authedUser.username);
  const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl: origin });
  const statusCallbackUrl = buildConferenceStatusCallbackUrl(origin);

  let agentLeg = null;
  try {
    const agentTwiml = buildConferenceTwiMl({
      conferenceName,
      participant: "agent",
      muteOnEntry: true,
      callerId: fromNumber,
      statusCallbackUrl,
    });

    agentLeg = await client.calls.create({
      to: `client:${clientIdentity}`,
      from: fromNumber,
      twiml: agentTwiml,
      ...callbackParams,
    });

    await call.update({
      twilioSid: agentLeg.sid || null,
      status: String(agentLeg.status || "queued").toLowerCase(),
    });
  } catch (err) {
    await call.update({ status: "failed" }).catch(() => {});
    return NextResponse.json(
      { error: err?.message || "Failed to ring your softphone" },
      { status: 502 },
    );
  }

  const conference = await waitForInProgressConference(client, conferenceName, {
    attempts: 40,
    delayMs: 400,
  });
  if (!conference?.sid) {
    try {
      if (agentLeg?.sid) await client.calls(agentLeg.sid).update({ status: "completed" });
    } catch {
      /* ignore */
    }
    await call.update({ status: "failed" }).catch(() => {});
    return NextResponse.json(
      {
        error:
          "Conference did not start. Answer the softphone ring (Sales Bot listen-in), then try again.",
      },
      { status: 409 },
    );
  }

  try {
    await removeLabeledParticipant(client, conference.sid, SALES_BOT_LABEL).catch(() => {});
    await addSpeakingSalesBot({
      client,
      conferenceSid: conference.sid,
      origin,
      callId: call.id,
    });

    const live = await waitForSalesBotSession(call.id, 12000);
    if (!live) {
      console.warn("[sales-bot] relay session not ready yet; bot may still connect");
    }

    const customerLeg = await addCustomerToConference({
      client,
      conferenceSid: conference.sid,
      toNumber: normalizedToNumber,
      fromNumber,
      endConferenceOnExit: true,
    });

    const customerSid = customerLeg?.callSid || null;
    if (customerSid) {
      await call.update({ customerCallSid: customerSid }).catch(() => {});
    }

    // Background: when customer answers, AI speaks from the start (do not block HTTP).
    if (customerSid) {
      const callIdForSpeech = call.id;
      void (async () => {
        for (let i = 0; i < 90; i++) {
          const cust = await client.calls(customerSid).fetch().catch(() => null);
          const st = String(cust?.status || "").toLowerCase();
          if (st === "in-progress") {
            await beginSalesBotSpeech({ callId: callIdForSpeech }).catch((err) => {
              console.error("[sales-bot] begin speech failed:", err?.message || err);
            });
            return;
          }
          if (["completed", "busy", "failed", "no-answer", "canceled", "cancelled"].includes(st)) {
            return;
          }
          await sleep(500);
        }
      })();
    }

    const refreshed = await call.reload();
    return NextResponse.json(
      {
        ok: true,
        call: refreshed,
        conferenceName,
        dialMode: "sales_bot",
        message:
          "Listening muted. Softphone should ring — answer to listen. AI speaks when the customer answers. Unmute in the dialer if you need to jump in.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[sales-bot] start failed:", err?.message || err);
    try {
      await client.conferences(conference.sid).update({ status: "completed" });
    } catch {
      /* ignore */
    }
    await call.update({ status: "failed" }).catch(() => {});
    return NextResponse.json(
      { error: err?.message || "Failed to start sales bot call" },
      { status: 502 },
    );
  }
}
