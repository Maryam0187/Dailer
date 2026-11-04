import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  changeUserInclude,
  normalizeSalesBotKey,
  serializeSalesBotChange,
} from "@/server/calls/salesBotTraining";

export const runtime = "nodejs";

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const botKey = normalizeSalesBotKey(new URL(req.url).searchParams.get("bot"));
  const rows = await db.SalesBotTrainingChange.findAll({
    where: { botKey },
    include: [changeUserInclude],
    order: [["id", "DESC"]],
    limit: 50,
  });

  return NextResponse.json({
    changes: rows.map((row) => serializeSalesBotChange(row)),
  });
}
