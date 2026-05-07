import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient } from "@/server/twilio";

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

async function buildAgentNameMap(participants) {
  const ids = Array.from(
    new Set(
      participants
        .map((p) => extractUserIdFromIdentity(extractIdentity(p)))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
  if (!ids.length) return new Map();
  const users = await db.User.findAll({
    where: { id: ids },
    attributes: ["id", "username"],
  });
  return new Map(users.map((u) => [u.id, u.username]));
}

async function addOwnerToNameMap(agentNameMap, ownerUserId) {
  const ownerId = Number(ownerUserId);
  if (!Number.isInteger(ownerId) || ownerId <= 0 || agentNameMap.has(ownerId)) return;
  const owner = await db.User.findByPk(ownerId, { attributes: ["id", "username"] });
  if (owner) agentNameMap.set(owner.id, owner.username);
}

function inferParticipantLabel(participant, agentNameMap, customerNumber) {
  const to = String(participant?.to || "").trim();
  const from = String(participant?.from || "").trim();
  const identity = extractIdentity(participant);
  if (identity) {
    const uid = extractUserIdFromIdentity(identity);
    return agentNameMap.get(uid) || identity;
  }
  if (to || from) return customerNumber || to || from;
  return customerNumber || "Customer";
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
  return [
    ...items,
    {
      callSid: `owner:${label.toLowerCase()}`,
      label,
      type: "agent",
      muted: false,
      hold: false,
      status: "joined",
      joinedAt: null,
    },
  ];
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const callId = Number(url.searchParams.get("callId"));
  const conferenceName = String(url.searchParams.get("conferenceName") || "").trim();

  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "callId must be a positive integer" }, { status: 400 });
  }
  if (!conferenceName) {
    return NextResponse.json({ error: "conferenceName is required" }, { status: 400 });
  }

  const callLog = await db.CallLog.findOne({
    where: { id: callId },
    attributes: ["id", "toNumber", "userId"],
  });
  if (!callLog) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  try {
    const client = getTwilioClient();
    const matches = await client.conferences.list({
      friendlyName: conferenceName,
      status: "in-progress",
      limit: 1,
    });

    if (!matches.length) {
      return NextResponse.json({ conferenceName, participants: [] });
    }

    const conference = matches[0];
    const participantRecords = await client
      .conferences(conference.sid)
      .participants.list({ limit: 50 });
    const agentNameMap = await buildAgentNameMap(participantRecords);
    await addOwnerToNameMap(agentNameMap, callLog.userId);
    const participantsRaw = participantRecords.map((p) => ({
      callSid: p.callSid,
      label: inferParticipantLabel(p, agentNameMap, callLog.toNumber),
      type: inferParticipantType(p),
      muted: Boolean(p.muted),
      hold: Boolean(p.hold),
      status: p.status || "joined",
      joinedAt: p.dateCreated ? new Date(p.dateCreated).toISOString() : null,
    }));
    const ownerLabel = agentNameMap.get(Number(callLog.userId));
    const participants = dedupeParticipants(appendOwnerParticipant(participantsRaw, ownerLabel));

    return NextResponse.json({
      conferenceName,
      conferenceSid: conference.sid,
      participants,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to load conference participants" },
      { status: 502 },
    );
  }
}

