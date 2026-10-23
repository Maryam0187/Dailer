import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import {
  extractZoomParties,
  mapZoomEndStatus,
  mapZoomLogResultStatus,
  parseZoomDurationSeconds,
} from "@/server/calls/zoomCallLog";

const HANDLED = new Set([
  "zp-call-ringing-event",
  "zp-call-connected-event",
  "zp-call-ended-event",
  "zp-call-log-completed-event",
]);

async function findZoomCall(userId, externalCallId) {
  if (!externalCallId) return null;
  return db.CallLog.findOne({
    where: {
      userId,
      voiceProvider: "zoom",
      externalCallId: String(externalCallId),
    },
    order: [["id", "DESC"]],
  });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!ZOOM_SMART_EMBED_ENABLED || !authedUser.canUseZoomPhone) {
    return NextResponse.json({ error: "Zoom Phone is not enabled for this user" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const type = String(body?.type || "").trim();
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const eventId = body?.id != null ? String(body.id) : null;

  if (!HANDLED.has(type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const externalCallId = data.callId != null ? String(data.callId) : null;
  if (!externalCallId) {
    return NextResponse.json({ error: "callId required" }, { status: 400 });
  }

  const parties = extractZoomParties(data);
  let call = await findZoomCall(authedUser.id, externalCallId);

  if (!call) {
    call = await db.CallLog.create({
      userId: authedUser.id,
      fromNumber: parties.fromNumber,
      toNumber: parties.toNumber,
      direction: parties.direction,
      status: type === "zp-call-connected-event" ? "in-progress" : "ringing",
      contactName: parties.contactName,
      voiceProvider: "zoom",
      externalCallId,
      dialMode: "zoom_embed",
      callKind: "zoom",
      dialerIndex: 1,
      durationSeconds: null,
      twilioSid: null,
    });
  } else {
    const updates = {};
    if (parties.fromNumber && !call.fromNumber) updates.fromNumber = parties.fromNumber;
    if (parties.toNumber && parties.toNumber !== "unknown") updates.toNumber = parties.toNumber;
    if (parties.contactName && !call.contactName) updates.contactName = parties.contactName;
    if (parties.direction) updates.direction = parties.direction;

    if (type === "zp-call-ringing-event" && call.status === "queued") {
      updates.status = "ringing";
    }
    if (type === "zp-call-connected-event") {
      updates.status = "in-progress";
    }
    if (type === "zp-call-ended-event") {
      updates.status = mapZoomEndStatus(data.result);
    }
    if (type === "zp-call-log-completed-event") {
      if (data.callLogId != null) updates.externalCallLogId = String(data.callLogId);
      updates.status = mapZoomLogResultStatus(data.result);
      const dur = parseZoomDurationSeconds(data.duration);
      if (dur != null) {
        updates.durationSeconds = dur;
        updates.customerDurationSeconds = dur;
      }
      if (parties.fromNumber) updates.fromNumber = parties.fromNumber;
      if (parties.toNumber && parties.toNumber !== "unknown") updates.toNumber = parties.toNumber;
      if (parties.contactName) updates.contactName = parties.contactName;
    }

    if (Object.keys(updates).length) {
      await call.update(updates);
    }
  }

  return NextResponse.json({
    ok: true,
    callId: call.id,
    externalCallId,
    eventId,
    type,
    status: call.status,
  });
}
