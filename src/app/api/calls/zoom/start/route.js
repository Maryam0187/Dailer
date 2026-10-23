import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { refreshCallDailyMetricsForCall } from "@/server/calls/callDailyMetrics";

/**
 * Reserve an outbound Zoom CallLog for the dialer user who clicked Call.
 * Soft Embed events from other open sessions attach to this row instead of creating duplicates.
 */
export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!ZOOM_SMART_EMBED_ENABLED || !authedUser.canUseZoomPhone) {
    return NextResponse.json({ error: "Zoom Phone is not enabled for this user" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawTo = body?.toNumber;
  const normalizedToNumber = normalizeToE164(rawTo) || String(rawTo || "").trim().slice(0, 32);

  if (!normalizedToNumber) {
    return NextResponse.json({ error: "toNumber is required" }, { status: 400 });
  }

  const call = await db.CallLog.create({
    userId: authedUser.id,
    fromNumber: null,
    toNumber: normalizedToNumber,
    direction: "outbound",
    status: "initiated",
    voiceProvider: "zoom",
    dialMode: "zoom_embed",
    callKind: "zoom",
    dialerIndex: 1,
    durationSeconds: null,
    twilioSid: null,
    externalCallId: null,
  });

  try {
    await refreshCallDailyMetricsForCall(call);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    ok: true,
    callId: call.id,
    toNumber: call.toNumber,
  });
}
