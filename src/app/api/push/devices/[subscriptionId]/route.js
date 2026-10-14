import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import { deletePushSubscription } from "@/server/push/oneSignal";
import { describeOneSignalAuth } from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/push/devices/[subscriptionId]
 * Remove a push subscription that belongs to the logged-in user.
 */
export async function DELETE(_request, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const subscriptionId = String((await params)?.subscriptionId || "").trim();
  if (!subscriptionId) {
    return NextResponse.json({ ok: false, error: "Missing subscription id" }, { status: 400 });
  }

  const auth = describeOneSignalAuth();
  if (!auth.serverPushReady) {
    return NextResponse.json({ ok: false, error: auth.hint || "Push not configured" }, { status: 503 });
  }

  const externalId = toOneSignalExternalId(authedUser.id, authedUser.username);
  if (!externalId) {
    return NextResponse.json({ ok: false, error: "Invalid user" }, { status: 400 });
  }

  const result = await deletePushSubscription(externalId, subscriptionId);
  if (!result.ok) {
    const status =
      result.reason === "not_found" ? 404 : result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.reason || "Delete failed" }, { status });
  }

  return NextResponse.json({ ok: true, subscriptionId });
}
