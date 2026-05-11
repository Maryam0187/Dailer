import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createVoiceAccessToken,
  getAgentClientIdentity,
  isTwilioBrowserAgentConfigured,
} from "@/server/twilioVoiceToken";
import { acquireOrRefreshSession } from "@/server/userSession";

export const runtime = "nodejs";

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTwilioBrowserAgentConfigured()) {
    return NextResponse.json(
      {
        error: "Twilio browser agent is not configured",
        hint: "Set TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET (see .env.local.example). Identities are per user (agent_{userId}).",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId", code: "missing_session_id" },
      { status: 400 },
    );
  }

  const claim = await acquireOrRefreshSession(authedUser.id, sessionId);
  if (!claim.ok) {
    return NextResponse.json(
      {
        error: "Dialer is active in another tab or device",
        code: "session_locked",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const identity = getAgentClientIdentity(authedUser.id, authedUser.username);
    const { token } = createVoiceAccessToken(identity);
    return NextResponse.json(
      { token, identity },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to create voice token" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
