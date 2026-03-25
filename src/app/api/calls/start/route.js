import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const toNumber = body?.toNumber;
  const fromNumber = body?.fromNumber ?? process.env.DIAL_FROM_NUMBER ?? null;

  if (!toNumber || typeof toNumber !== "string") {
    return NextResponse.json({ error: "toNumber is required" }, { status: 400 });
  }

  const call = await db.CallLog.create({
    userId: authedUser.id,
    fromNumber,
    toNumber,
    direction: "outbound",
    status: "queued",
    durationSeconds: null,
  });

  return NextResponse.json({ ok: true, call }, { status: 201 });
}

