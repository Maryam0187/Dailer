import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeUserActivity } from "@/server/activity/serializeUserActivity";

export async function GET(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawUserId, activityId: rawActivityId } = await params;
  const userId = Number(rawUserId);
  const activityId = Number(rawActivityId);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!Number.isInteger(activityId) || activityId < 1) {
    return NextResponse.json({ error: "Invalid activity id" }, { status: 400 });
  }

  const target = await db.User.findByPk(userId, {
    attributes: ["id"],
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await db.UserActivity.findOne({
    where: { id: activityId, userId: target.id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ activity: serializeUserActivity(row) });
}
