import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import { sendPushToUser } from "@/server/push/oneSignal";
import { describeOneSignalAuth } from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/push/test — send a test push to the logged-in user. */
export async function POST() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const externalId = toOneSignalExternalId(authedUser.id, authedUser.username);
  const auth = describeOneSignalAuth();
  const send = await sendPushToUser(authedUser.id, {
    title: "Dialer test",
    body: "If you see this, push is working.",
    username: authedUser.username,
    url: "/messages",
  });

  return NextResponse.json({
    externalId,
    auth,
    send,
  });
}
