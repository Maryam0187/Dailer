import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { ZOOM_SMART_EMBED_ENABLED } from "@/lib/zoomSmartEmbedFlag";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

/**
 * Permission gate before Soft Embed zp-make-call.
 * Does NOT create a CallLog — Soft Embed may fail (no Zoom Phone license / not signed in)
 * even when canUseZoomPhone is true. Live Status + minutes only come from /zoom/event
 * when Soft Embed actually rings/connects.
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

  return NextResponse.json({
    ok: true,
    toNumber: normalizedToNumber,
  });
}
