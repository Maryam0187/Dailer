import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  getTwilioClient,
  getTwilioFromNumber,
  getTwilioStatusCallbackParamsWithFallback,
} from "@/server/twilio";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";
import { emitToUser } from "@/server/socketHub";

function getRequestBaseUrl(req) {
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  const host = req.headers.get("host");
  if (host) {
    const isLocalHost =
      host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const protocol = isLocalHost ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return req?.nextUrl?.origin || null;
}

function buildVoiceUrl(baseUrl, conferenceName, participant) {
  const qs = new URLSearchParams({ conferenceName, participant });
  return `${baseUrl}/api/twilio/voice?${qs.toString()}`;
}

function inferParticipantLabel(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  if (to.startsWith("client:")) return to.replace("client:", "");
  if (from.startsWith("client:")) return from.replace("client:", "");
  if (to) return to;
  if (from) return from;
  return String(participant?.callSid || "Unknown participant");
}

function inferParticipantType(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  if (to.startsWith("client:") || from.startsWith("client:")) return "agent";
  return "external";
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = Number(body?.callId);
  const conferenceName = String(body?.conferenceName || "").trim();
  const agentUserId = Number(body?.agentUserId);

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }
  if (!conferenceName) {
    return NextResponse.json({ error: "conferenceName is required" }, { status: 400 });
  }
  if (!Number.isInteger(agentUserId) || agentUserId <= 0) {
    return NextResponse.json({ error: "agentUserId must be a positive integer" }, { status: 400 });
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId, userId: authedUser.id },
    attributes: ["id", "userId", "toNumber"],
  });
  if (!callLog) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const targetAgent = await db.User.findOne({
    where: { id: agentUserId, role: "agent", isActive: true },
    attributes: ["id", "username", "role", "managerId"],
  });
  if (!targetAgent) {
    return NextResponse.json({ error: "Selected agent is not available" }, { status: 404 });
  }

  // Managers can invite only agents they manage; admin can invite any agent.
  if (authedUser.role === "manager" && targetAgent.managerId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fallbackBaseUrl = getRequestBaseUrl(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio voice webhook" },
      { status: 500 },
    );
  }

  try {
    const client = getTwilioClient();
    const fromNumber = getTwilioFromNumber();
    const agentIdentity = getAgentClientIdentity(targetAgent.id, targetAgent.username);
    const conferenceMatches = await client.conferences.list({
      friendlyName: conferenceName,
      status: "in-progress",
      limit: 1,
    });

    const participantRecords = conferenceMatches.length
      ? await client.conferences(conferenceMatches[0].sid).participants.list({ limit: 50 })
      : [];
    const existingParticipants = participantRecords.map((p) => ({
      callSid: p.callSid,
      label: inferParticipantLabel(p),
      type: inferParticipantType(p),
      status: p.status || "joined",
    }));

    const participantSummary = existingParticipants.map((p) => p.label).join(", ");
    const joinVoiceUrl = `${buildVoiceUrl(fallbackBaseUrl, conferenceName, "agent")}&participantSummary=${encodeURIComponent(participantSummary)}`;
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });
    const leg = await client.calls.create({
      to: `client:${agentIdentity}`,
      from: fromNumber,
      url: joinVoiceUrl,
      ...callbackParams,
    });

    emitToUser(targetAgent.id, "call:invite", {
      callId,
      conferenceName,
      fromAgent: authedUser.username,
      customer: callLog?.toNumber || null,
      participants: existingParticipants,
      sentAt: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        ok: true,
        invitedAgent: {
          id: targetAgent.id,
          username: targetAgent.username,
          identity: agentIdentity,
          sid: leg.sid,
          status: leg.status,
        },
        participants: existingParticipants,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to invite agent to conference" },
      { status: 502 },
    );
  }
}

