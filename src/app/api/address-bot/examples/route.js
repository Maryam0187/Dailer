import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAddressBotTrainer } from "@/server/auth/requireAddressBotTrainer";
import {
  exampleUserInclude,
  parseAddressBotExampleBody,
  recordAddressBotTrainingChange,
  serializeAddressBotExample,
} from "@/server/calls/addressBotTraining";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAddressBotTrainer();
  if (errorResponse) return errorResponse;

  const rows = await db.AddressBotTrainingExample.findAll({
    include: [exampleUserInclude],
    order: [["id", "ASC"]],
  });

  return NextResponse.json({
    examples: rows.map((row) => serializeAddressBotExample(row)),
  });
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireAddressBotTrainer();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const { data, errors } = parseAddressBotExampleBody(body, { requireAll: true });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const row = await db.AddressBotTrainingExample.create({
    ...data,
    updatedBy: authedUser.id,
  });
  await recordAddressBotTrainingChange({
    userId: authedUser.id,
    action: "add_example",
    summary: `Q: ${data.question} A: ${data.answer}`,
  });

  const withUser = await db.AddressBotTrainingExample.findByPk(row.id, { include: [exampleUserInclude] });
  return NextResponse.json(
    { example: serializeAddressBotExample(withUser || row) },
    { status: 201 },
  );
}
