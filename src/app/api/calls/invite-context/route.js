import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getTwilioClient } from "@/server/twilio";
import { getAgentClientIdentity } from "@/server/twilioVoiceToken";

export const runtime = "nodejs";

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

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const incomingCallSid = String(url.searchParams.get("callSid") || "").trim();
  if (!incomingCallSid) {
    return NextResponse.json({ error: "callSid is required" }, { status: 400 });
  }

  try {
    const client = getTwilioClient();
    const identity = getAgentClientIdentity(authedUser.id, authedUser.username);
    const clientTarget = `client:${identity}`;
    const conferences = await client.conferences.list({ status: "in-progress", limit: 30 });

    for (const conference of conferences) {
      const participants = await client.conferences(conference.sid).participants.list({ limit: 60 });
      const matched = participants.some((p) => {
        const to = String(p.to || "").trim();
        const from = String(p.from || "").trim();
        return p.callSid === incomingCallSid || to === clientTarget || from === clientTarget;
      });
      if (!matched) continue;

      const participantCallSids = participants
        .map((p) => String(p.callSid || "").trim())
        .filter(Boolean);
      const participantUserIds = Array.from(
        new Set(
          participants
            .map((p) => extractUserIdFromIdentity(extractIdentity(p)))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      );
      const users = participantUserIds.length
        ? await db.User.findAll({
            where: { id: participantUserIds },
            attributes: ["id", "username"],
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.username]));
      let resolvedCallId = null;
      let customerNumber = null;
      let ownerLabel = null;
      if (participantCallSids.length) {
        const log = await db.CallLog.findOne({
          where: { twilioSid: participantCallSids },
          attributes: ["id", "toNumber", "userId"],
          order: [["createdAt", "DESC"]],
        });
        resolvedCallId = log?.id ?? null;
        customerNumber = log?.toNumber ?? null;
        const ownerId = Number(log?.userId);
        if (Number.isInteger(ownerId) && ownerId > 0) {
          const ownerUser = await db.User.findByPk(ownerId, { attributes: ["id", "username"] });
          if (ownerUser) {
            userMap.set(ownerUser.id, ownerUser.username);
            ownerLabel = ownerUser.username;
          }
        }
      }

      const participantsResolved = participants.map((p) => ({
        callSid: p.callSid,
        label: (() => {
          const raw = inferParticipantLabel(p);
          const uid = extractUserIdFromIdentity(raw);
          if (uid && userMap.get(uid)) return userMap.get(uid);
          if (raw === "Customer" && customerNumber) return customerNumber;
          return raw;
        })(),
        type: inferParticipantType(p),
        status: p.status || "joined",
      }));

      return NextResponse.json({
        callId: resolvedCallId,
        conferenceName: conference.friendlyName || null,
        participants: dedupeParticipants(appendOwnerParticipant(participantsResolved, ownerLabel)),
      });
    }

    return NextResponse.json({ callId: null, conferenceName: null, participants: [] });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve invite context" },
      { status: 502 },
    );
  }
}

