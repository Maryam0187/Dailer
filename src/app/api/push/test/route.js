import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import { sendPushToUser } from "@/server/push/oneSignal";
import { describeOneSignalAuth } from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/test
 * Send a test push to the logged-in user's Subscribed devices.
 */
export async function POST() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const externalId = toOneSignalExternalId(authedUser.id, authedUser.username);
  const auth = describeOneSignalAuth();

  if (!auth.serverPushReady) {
    return NextResponse.json(
      { ok: false, externalId, auth, error: auth.hint || "Push not configured" },
      { status: 503 },
    );
  }

  const send = await sendPushToUser(authedUser.id, {
    title: "Dialer test",
    body: "If you see this, push is working on this device.",
    username: authedUser.username,
    url: "/messages",
  });

  return NextResponse.json({
    ok: Boolean(send?.ok),
    externalId,
    auth: { serverPushReady: auth.serverPushReady, hint: auth.hint },
    send,
  });
}
