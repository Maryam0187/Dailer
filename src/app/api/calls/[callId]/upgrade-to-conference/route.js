import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { upgradeCallToConference } from "@/server/calls/upgradeToConference";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { callId: rawCallId } = await params;
  const callId = Number(rawCallId);
  const result = await upgradeCallToConference({ req, authedUser, callId });
  if (!result.ok) {
    const body = { error: result.error };
    if (result.twilioHint) body.twilioHint = result.twilioHint;
    return NextResponse.json(body, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    alreadyUpgraded: result.alreadyUpgraded,
    conferenceName: result.conferenceName,
    callMode: result.callMode,
  });
}
