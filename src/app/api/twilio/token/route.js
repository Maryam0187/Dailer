import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { createVoiceAccessToken, isTwilioBrowserAgentConfigured } from "@/server/twilioVoiceToken";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTwilioBrowserAgentConfigured()) {
    return NextResponse.json(
      {
        error: "Twilio browser agent is not configured",
        hint: "Set TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_AGENT_CLIENT_IDENTITY (see .env.local.example).",
      },
      { status: 503 },
    );
  }

  try {
    const { token, identity } = createVoiceAccessToken();
    return NextResponse.json({ token, identity });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to create voice token" },
      { status: 500 },
    );
  }
}
