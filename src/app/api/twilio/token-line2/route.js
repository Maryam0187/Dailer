import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createVoiceAccessToken,
  getAgentClientIdentityLine2,
  isTwilioBrowserAgentConfigured,
} from "@/server/twilioVoiceToken";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!authedUser.canUseDialer2) {
    return NextResponse.json({ error: "Second dialer is not enabled for this account" }, { status: 403 });
  }

  if (!isTwilioBrowserAgentConfigured()) {
    return NextResponse.json(
      { error: "Twilio browser agent is not configured" },
      { status: 503 },
    );
  }

  try {
    const identity = getAgentClientIdentityLine2(authedUser.id, authedUser.username);
    const { token } = createVoiceAccessToken(identity);
    return NextResponse.json(
      { token, identity, dialerIndex: 2 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to create Line 2 voice token" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
