import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { shouldRedactLeadPhones } from "@/lib/maskPhone";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { getRequestBaseUrl } from "@/server/calls/requestBaseUrl";
import { getTwilioStatusCallbackParamsWithFallback } from "@/server/twilio";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";
import {
  resolveDialUser,
  getTeamTwilioContext,
  resolveFromNumberLine1,
} from "@/server/twilio/callOwnerTwilio";

function buildBridgeVoiceUrl(baseUrl, callId) {
  const qs = new URLSearchParams({ callId: String(callId) });
  return `${baseUrl}/api/twilio/voice/bridge?${qs.toString()}`;
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const leadId = Number(body?.leadId);
  if (authedUser.accessMode === "limited" && Number.isInteger(leadId) && leadId > 0) {
    return NextResponse.json({ error: "Lead calls are not available with limited after-shift access." }, { status: 403 });
  }

  let toNumber = body?.toNumber;
  let lead = null;

  if (Number.isInteger(leadId) && leadId > 0) {
    if (shouldRedactLeadPhones(authedUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    lead = await db.Lead.findByPk(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (lead.status === "dnc") {
      return NextResponse.json({ error: "Lead is marked Do Not Call" }, { status: 400 });
    }
    toNumber = lead.phone;
  }

  const normalizedToNumber = normalizeToE164(toNumber);

  if (!toNumber || typeof toNumber !== "string" || !normalizedToNumber) {
    return NextResponse.json(
      { error: "toNumber or leadId with a valid phone is required" },
      { status: 400 },
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
    fromNumber = body?.fromNumber
      ? String(body.fromNumber).trim()
      : await resolveFromNumberLine1(dialUser, ctx);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Twilio From number is not configured for this user" },
      { status: 400 },
    );
  }

  const fallbackBaseUrl = getRequestBaseUrl(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio voice webhook" },
      { status: 500 },
    );
  }

  const call = await db.CallLog.create({
    userId: authedUser.id,
    leadId: lead?.id || null,
    fromNumber,
    toNumber: normalizedToNumber,
    direction: "outbound",
    status: "initiated",
    callKind: lead ? "lead" : null,
    dialMode: "agent_first",
    contactName: lead?.fullName?.trim() || null,
    city: lead?.city || null,
    state: lead?.state || null,
    zipCode: lead?.zipCode || null,
    twilioSid: null,
    durationSeconds: null,
  });

  if (lead?.id) {
    try {
      const { bumpLeadCallLogsCount } = await import("@/server/leads/bumpLeadCallLogsCount");
      await bumpLeadCallLogsCount(lead.id, 1);
    } catch {
      /* count is best-effort */
    }
  }

  let agentLeg = null;
  try {
    const client = ctx.client;
    const clientIdentity = getAgentClientIdentity(authedUser.id, authedUser.username);
    const bridgeVoiceUrl = buildBridgeVoiceUrl(fallbackBaseUrl, call.id);
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });

    agentLeg = await client.calls.create({
      to: `client:${clientIdentity}`,
      from: fromNumber,
      url: bridgeVoiceUrl,
      ...callbackParams,
    });

    const agentStatus = String(agentLeg.status || "queued").toLowerCase();
    await call.update({
      twilioSid: agentLeg.sid || null,
      status: agentStatus,
    });

    if (lead && lead.status === "new") {
      await lead.update({ status: "contacted" }).catch(() => {});
    }
  } catch (err) {
    await call.update({ status: "failed" }).catch(() => {});
    return NextResponse.json(
      {
        error: err?.message || "Failed to place call with Twilio",
      },
      { status: 502 },
    );
  }

  const refreshed = await call.reload();
  return NextResponse.json(
    {
      ok: true,
      call: refreshed,
      callMode: "direct",
      dialMode: "agent_first",
      lead: lead
        ? {
            id: lead.id,
            fullName: lead.fullName,
            cellNumber: lead.cellNumber,
            phone: lead.phone,
          }
        : null,
    },
    { status: 201 },
  );
}
