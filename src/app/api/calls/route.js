import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canSeeAllCalls = authedUser.role === "admin" || authedUser.role === "manager";
  const calls = await db.CallLog.findAll({
    where: canSeeAllCalls ? undefined : { userId: authedUser.id },
    order: [["createdAt", "DESC"]],
    attributes: [
      "id",
      "userId",
      "fromNumber",
      "toNumber",
      "direction",
      "status",
      "durationSeconds",
      "createdAt",
    ],
    include: [
      {
        model: db.User,
        as: "user",
        attributes: ["id", "username"],
      },
    ],
  });

  return NextResponse.json({
    calls: calls.map((call) => ({
      id: call.id,
      userId: call.userId,
      agentName: call.user?.username || "—",
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      direction: call.direction,
      status: call.status,
      durationSeconds: call.durationSeconds,
      createdAt: call.createdAt,
    })),
  });
}
