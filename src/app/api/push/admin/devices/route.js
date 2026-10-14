import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { listPushDevicesForAllUsers, listPushDevicesForUser } from "@/server/push/oneSignal";
import { describeOneSignalAuth } from "@/server/push/oneSignalEnv";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import db from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/admin/devices
 * Admin only — all users' OneSignal web push subscriptions.
 * Optional ?userId= for a single user.
 */
export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const auth = describeOneSignalAuth();
  if (!auth.serverPushReady) {
    return NextResponse.json(
      { ok: false, error: auth.hint || "Push not configured", auth },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const includeInactive = url.searchParams.get("inactive") === "1";

  if (userIdParam != null) {
    const userId = Number(userIdParam);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid userId" }, { status: 400 });
    }
    const user = await db.User.findByPk(userId, {
      attributes: ["id", "username", "role", "isActive"],
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    const listed = await listPushDevicesForUser(user.id, user.username);
    return NextResponse.json({
      ok: true,
      user: {
        userId: user.id,
        username: user.username,
        role: user.role,
        isActive: Boolean(user.isActive),
        externalId: listed.externalId || toOneSignalExternalId(user.id, user.username),
        onesignalId: listed.onesignalId || null,
        found: Boolean(listed.found),
        subscribedCount: listed.subscribedCount ?? 0,
        devices: listed.devices || [],
      },
    });
  }

  const listed = await listPushDevicesForAllUsers({ activeOnly: !includeInactive });
  return NextResponse.json(listed);
}
