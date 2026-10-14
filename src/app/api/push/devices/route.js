import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import { listPushDevicesForUser } from "@/server/push/oneSignal";
import { describeOneSignalAuth } from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/push/devices — subscribed devices for the logged-in user. */
export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const auth = describeOneSignalAuth();
  const externalId = toOneSignalExternalId(authedUser.id, authedUser.username);

  if (!auth.serverPushReady) {
    return NextResponse.json({
      ok: false,
      externalId,
      devices: [],
      auth: { serverPushReady: false, hint: auth.hint },
      error: auth.hint || "Push not configured",
    });
  }

  const listed = await listPushDevicesForUser(authedUser.id, authedUser.username);
  return NextResponse.json({
    ok: listed.ok,
    externalId: listed.externalId || externalId,
    onesignalId: listed.onesignalId || null,
    devices: listed.devices || [],
    subscribedCount: listed.subscribedCount ?? 0,
    auth: { serverPushReady: true },
  });
}
