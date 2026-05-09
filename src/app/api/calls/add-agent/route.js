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

function buildVoiceUrl(baseUrl, conferenceName, participant, options = {}) {
  const qs = new URLSearchParams({ conferenceName, participant });
  if (options.muteOnEntry) qs.set("muteOnEntry", "1");
  return `${baseUrl}/api/twilio/voice?${qs.toString()}`;
}

function inferParticipantLabel(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  if (to.startsWith("client:")) return to.replace("client:", "");
  if (from.startsWith("client:")) return from.replace("client:", "");
  if (to) return "Customer";
  if (from) return "Customer";
  return "Customer";
}

function extractIdentity(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  if (to.startsWith("client:")) return to.replace("client:", "");
  if (from.startsWith("client:")) return from.replace("client:", "");
  return null;
}

function extractUserIdFromIdentity(identity) {
  if (!identity) return null;
  const value = String(identity).trim();
  if (/^\d+-/.test(value)) return Number(value.split("-")[0]);
  if (/^agent-\d+-/.test(value)) return Number(value.split("-")[1]);
  return null;
}

function inferParticipantType(participant) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  if (to.startsWith("client:") || from.startsWith("client:")) return "agent";
  return "external";
}

function dedupeParticipants(items) {
  const map = new Map();
  for (const p of items) {
    const normalizedLabel =
      p.type === "external"
        ? String(p.label || "").replace(/[^\d+]/g, "")
        : String(p.label || "").toLowerCase().trim();
    const key = `${p.type}:${normalizedLabel}`;
    if (!map.has(key)) map.set(key, p);
  }
  return Array.from(map.values());
}

function appendOwnerParticipant(items, ownerLabel) {
  const label = String(ownerLabel || "").trim();
  if (!label) return items;
  return [...items, { callSid: `owner:${label.toLowerCase()}`, label, type: "agent", status: "joined" }];
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
    const identityIds = Array.from(
      new Set(
        participantRecords
          .map((p) => extractUserIdFromIdentity(extractIdentity(p)))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    if (Number.isInteger(Number(callLog.userId)) && Number(callLog.userId) > 0) {
      identityIds.push(Number(callLog.userId));
    }
    const users = identityIds.length
      ? await db.User.findAll({
          where: { id: identityIds },
          attributes: ["id", "username"],
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.username]));
    const existingParticipantsRaw = participantRecords.map((p) => ({
      callSid: p.callSid,
      label: (() => {
        const raw = inferParticipantLabel(p);
        const uid = extractUserIdFromIdentity(raw);
        if (uid && userMap.get(uid)) return userMap.get(uid);
        if (raw === "Customer" && callLog?.toNumber) return callLog.toNumber;
        return raw;
      })(),
      type: inferParticipantType(p),
      status: p.status || "joined",
    }));
    const ownerLabel = userMap.get(Number(callLog.userId));
    const existingParticipants = dedupeParticipants(
      appendOwnerParticipant(existingParticipantsRaw, ownerLabel),
    );

    const joinVoiceUrl = buildVoiceUrl(fallbackBaseUrl, conferenceName, "agent", {
      muteOnEntry: true,
    });
    const callbackParams = getTwilioStatusCallbackParamsWithFallback({ fallbackBaseUrl });
    const leg = await client.calls.create({
      to: `client:${agentIdentity}`,
      from: fromNumber,
      url: joinVoiceUrl,
      ...callbackParams,
    });

    await db.InviteDialLeg.create({
      callSid: leg.sid,
      callLogId: callId,
      conferenceName,
      invitedUserId: targetAgent.id,
      inviterUserId: authedUser.id,
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

