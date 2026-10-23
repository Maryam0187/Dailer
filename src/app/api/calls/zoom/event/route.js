import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import { refreshCallDailyMetricsForCall } from "@/server/calls/callDailyMetrics";
import {
  durationSecondsBetween,
  extractZoomOurLine,
  extractZoomParties,
  mapZoomEndStatus,
  mapZoomLogResultStatus,
  parseZoomDurationSeconds,
  parseZoomEventDate,
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

function mergeZoomLine(updates, line) {
  if (line.zoomExtensionNumber) updates.zoomExtensionNumber = line.zoomExtensionNumber;
  if (line.zoomPhoneNumber) updates.zoomPhoneNumber = line.zoomPhoneNumber;
  if (line.zoomDisplayName) updates.zoomDisplayName = line.zoomDisplayName;
}

async function refreshMetrics(call) {
  try {
    await refreshCallDailyMetricsForCall(call);
  } catch {
    /* rollup is best-effort; CallLog remains source of truth until backfill */
  }
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
  const ourLine = extractZoomOurLine(data);
  const eventAt = parseZoomEventDate(data.dateTime) || new Date();
  let call = await findZoomCall(authedUser.id, externalCallId);
  let changed = false;

  if (!call) {
    const createPayload = {
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
      zoomExtensionNumber: ourLine.zoomExtensionNumber,
      zoomPhoneNumber: ourLine.zoomPhoneNumber,
      zoomDisplayName: ourLine.zoomDisplayName,
      zoomConnectedAt: type === "zp-call-connected-event" ? eventAt : null,
    };

    if (type === "zp-call-ended-event") {
      createPayload.status = mapZoomEndStatus(data.result);
    }
    if (type === "zp-call-log-completed-event") {
      if (data.callLogId != null) createPayload.externalCallLogId = String(data.callLogId);
      createPayload.status = mapZoomLogResultStatus(data.result);
      const dur = parseZoomDurationSeconds(data.duration);
      if (dur != null) {
        createPayload.durationSeconds = dur;
        createPayload.customerDurationSeconds = dur;
      }
    }

    call = await db.CallLog.create(createPayload);
    changed = true;
  } else {
    const updates = {};
    if (parties.fromNumber && !call.fromNumber) updates.fromNumber = parties.fromNumber;
    if (parties.toNumber && parties.toNumber !== "unknown") updates.toNumber = parties.toNumber;
    if (parties.contactName && !call.contactName) updates.contactName = parties.contactName;
    if (parties.direction) updates.direction = parties.direction;
    mergeZoomLine(updates, ourLine);

    if (type === "zp-call-ringing-event") {
      if (call.status === "queued" || call.status === "initiated") updates.status = "ringing";
    }

    if (type === "zp-call-connected-event") {
      updates.status = "in-progress";
      if (!call.zoomConnectedAt) updates.zoomConnectedAt = eventAt;
    }

    if (type === "zp-call-ended-event") {
      updates.status = mapZoomEndStatus(data.result);
      if (call.durationSeconds == null && call.zoomConnectedAt) {
        const dur = durationSecondsBetween(call.zoomConnectedAt, eventAt);
        if (dur != null) {
          updates.durationSeconds = dur;
          updates.customerDurationSeconds = dur;
        }
      }
    }

    if (type === "zp-call-log-completed-event") {
      if (data.callLogId != null) updates.externalCallLogId = String(data.callLogId);
      updates.status = mapZoomLogResultStatus(data.result);
      const dur = parseZoomDurationSeconds(data.duration);
      if (dur != null) {
        updates.durationSeconds = dur;
        updates.customerDurationSeconds = dur;
      } else if (call.durationSeconds == null && call.zoomConnectedAt) {
        const fallback = durationSecondsBetween(call.zoomConnectedAt, eventAt);
        if (fallback != null) {
          updates.durationSeconds = fallback;
          updates.customerDurationSeconds = fallback;
        }
      }
      if (parties.fromNumber) updates.fromNumber = parties.fromNumber;
      if (parties.toNumber && parties.toNumber !== "unknown") updates.toNumber = parties.toNumber;
      if (parties.contactName) updates.contactName = parties.contactName;
    }

    if (Object.keys(updates).length) {
      await call.update(updates);
      changed = true;
    }
  }

  if (changed) {
    call = await call.reload();
    await refreshMetrics(call);
  }

  return NextResponse.json({
    ok: true,
    callId: call.id,
    externalCallId,
    eventId,
    type,
    status: call.status,
    durationSeconds: call.durationSeconds ?? null,
  });
}
