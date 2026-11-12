import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { rejectIfOutboundBlocked } from "@/server/calls/blockedNumbers";

/**
 * Permission gate before Soft Embed zp-make-call.
 * A blocked number is saved here as no-answer and the dial stops.
 * Other Zoom calls still get CallLogs from /zoom/event when Soft Embed rings.
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

  const e164 = normalizeToE164(rawTo);
  if (e164) {
    const blockedResponse = await rejectIfOutboundBlocked(e164, {
      userId: authedUser.id,
      fromNumber: null,
      voiceProvider: "zoom",
    });
    if (blockedResponse) return blockedResponse;
  }

  return NextResponse.json({
    ok: true,
    toNumber: normalizedToNumber,
  });
}
