import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createVoiceAccessToken,
  getAgentClientIdentity,
  isTwilioBrowserAgentConfigured,
} from "@/server/twilioVoiceToken";

export const runtime = "nodejs";

export async function GET() {
  // Single-session enforcement happens inside getAuthedUser: if a newer login
  // rotated the user's activeSessionId, this cookie is treated as unauthenticated.
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
