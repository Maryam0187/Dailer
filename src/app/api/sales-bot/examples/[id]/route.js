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

export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid example id" }, { status: 400 });
  }

  const row = await db.SalesBotTrainingExample.findByPk(id);
  if (!row) return NextResponse.json({ error: "Example not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { data, errors } = parseSalesBotExampleBody(body, { requireAll: false });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await row.update({ ...data, updatedBy: authedUser.id });
  await recordSalesBotTrainingChange({
    userId: authedUser.id,
    action: "update_example",
    summary: `Q: ${row.question} A: ${row.answer}`,
  });

  const withUser = await db.SalesBotTrainingExample.findByPk(row.id, {
    include: [exampleUserInclude],
  });
  return NextResponse.json({ example: serializeSalesBotExample(withUser || row) });
}

export async function DELETE(_req, { params }) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid example id" }, { status: 400 });
  }

  const row = await db.SalesBotTrainingExample.findByPk(id);
  if (!row) return NextResponse.json({ error: "Example not found" }, { status: 404 });

  const summary = `Q: ${row.question} A: ${row.answer}`;
  await row.destroy();
  await recordSalesBotTrainingChange({
    userId: authedUser.id,
    action: "delete_example",
    summary,
  });

  return NextResponse.json({ ok: true });
}
