import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import {
  getOrCreateSalesBotProfile,
  normalizeSalesBotKey,
  parseSalesBotProfileBody,
  profileUserInclude,
  recordSalesBotTrainingChange,
  serializeSalesBotProfile,
} from "@/server/calls/salesBotTraining";

export const runtime = "nodejs";

export async function GET(req) {
  const { errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const botKey = normalizeSalesBotKey(new URL(req.url).searchParams.get("bot"));
  const row = await getOrCreateSalesBotProfile(botKey);
  const withUser = await db.SalesBotProfile.findByPk(row.id, { include: [profileUserInclude] });
  return NextResponse.json({ profile: serializeSalesBotProfile(withUser || row) });
}

export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const botKey = normalizeSalesBotKey(body?.botKey ?? new URL(req.url).searchParams.get("bot"));
  const { data, errors } = parseSalesBotProfileBody(body, { botKey });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const row = await getOrCreateSalesBotProfile(botKey);
  await row.update({ ...data, updatedBy: authedUser.id });

  const parts = [];
  if (data.name !== undefined) parts.push(`name: ${data.name}`);
  if (data.instructions !== undefined) parts.push(data.instructions || "(cleared instructions)");
  await recordSalesBotTrainingChange({
    userId: authedUser.id,
    botKey,
    action: "update_prompt",
    summary: parts.join(" — "),
  });

  const withUser = await db.SalesBotProfile.findByPk(row.id, { include: [profileUserInclude] });
  return NextResponse.json({ profile: serializeSalesBotProfile(withUser || row) });
}
