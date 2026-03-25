import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const calls = await db.CallLog.findAll({
    where: { userId: authedUser.id },
    order: [["createdAt", "DESC"]],
    attributes: [
      "id",
      "fromNumber",
      "toNumber",
      "direction",
      "status",
      "durationSeconds",
      "createdAt",
    ],
  });

  return NextResponse.json({ calls });
}
