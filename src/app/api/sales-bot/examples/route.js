import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import {
  exampleUserInclude,
  normalizeSalesBotKey,
  parseSalesBotExampleBody,
  recordSalesBotTrainingChange,
  serializeSalesBotExample,
} from "@/server/calls/salesBotTraining";

export const runtime = "nodejs";

export async function GET(req) {
  const { errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const botKey = normalizeSalesBotKey(new URL(req.url).searchParams.get("bot"));
  const rows = await db.SalesBotTrainingExample.findAll({
    where: { botKey },
    include: [exampleUserInclude],
    order: [["id", "ASC"]],
  });

  return NextResponse.json({
    examples: rows.map((row) => serializeSalesBotExample(row)),
  });
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const botKey = normalizeSalesBotKey(body?.botKey ?? new URL(req.url).searchParams.get("bot"));
  const { data, errors } = parseSalesBotExampleBody(body, { requireAll: true });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const row = await db.SalesBotTrainingExample.create({
    ...data,
    botKey,
    updatedBy: authedUser.id,
  });
  await recordSalesBotTrainingChange({
    userId: authedUser.id,
    botKey,
    action: "add_example",
    summary: `Q: ${data.question} A: ${data.answer}`,
  });

  const withUser = await db.SalesBotTrainingExample.findByPk(row.id, {
    include: [exampleUserInclude],
  });
  return NextResponse.json(
    { example: serializeSalesBotExample(withUser || row) },
    { status: 201 },
  );
}
