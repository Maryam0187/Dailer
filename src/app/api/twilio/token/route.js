import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createVoiceAccessTokenForUser,
  getAgentClientIdentity,
  isTwilioBrowserAgentConfiguredForUser,
} from "@/server/twilioVoiceToken";
import { resolveDialUser } from "@/server/twilio/callOwnerTwilio";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dialUser = await resolveDialUser(authedUser);
  if (!dialUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isTwilioBrowserAgentConfiguredForUser(dialUser))) {
    return NextResponse.json(
      {
        error: "Twilio browser agent is not configured",
        hint: "Admin: set main Twilio API keys (Numbers page) or team subaccount API keys for this manager.",
      },
      { status: 503 },
    );
  }

  try {
    const identity = getAgentClientIdentity(authedUser.id, authedUser.username);
    const { token } = await createVoiceAccessTokenForUser(dialUser, identity);
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
