import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import {
  exampleUserInclude,
  parseSalesBotExampleBody,
  recordSalesBotTrainingChange,
  serializeSalesBotExample,
} from "@/server/calls/salesBotTraining";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const rows = await db.SalesBotTrainingExample.findAll({
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
  const { data, errors } = parseSalesBotExampleBody(body, { requireAll: true });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const row = await db.SalesBotTrainingExample.create({
    ...data,
    updatedBy: authedUser.id,
  });
  await recordSalesBotTrainingChange({
    userId: authedUser.id,
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
