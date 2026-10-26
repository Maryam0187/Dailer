import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { changeUserInclude, serializeSalesBotChange } from "@/server/calls/salesBotTraining";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const rows = await db.SalesBotTrainingChange.findAll({
    include: [changeUserInclude],
    order: [["id", "DESC"]],
    limit: 50,
  });

  return NextResponse.json({
    changes: rows.map((row) => serializeSalesBotChange(row)),
  });
}
