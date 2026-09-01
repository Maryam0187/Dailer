import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import db from "@/server/db";
import { getGamificationSnapshot } from "@/server/attendance/processLoginGamification";
import { buildTierDeadlines } from "@/server/attendance/lateStatus";

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const rawUserId = searchParams.get("userId");
  const userId = rawUserId ? Number(rawUserId) : null;

  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = await db.User.findByPk(userId, {
    attributes: ["id", "username", "role", "shiftKey", "isOutside"],
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const gamification = await getGamificationSnapshot(userId);
  const tierLegend = buildTierDeadlines(user);

  return NextResponse.json({
    userId: user.id,
    username: user.username,
    ...gamification,
    tierLegend,
  });
}
