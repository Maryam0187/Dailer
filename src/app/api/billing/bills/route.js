import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const bills = await db.Bill.findAll({
    order: [["createdAt", "DESC"]],
    attributes: [
      "id",
      "fromDate",
      "toDate",
      "currency",
      "twilioBaseAmount",
      "fixedMarkupPerCall",
      "markupAmount",
      "totalCalls",
      "totalAmount",
      "createdAt",
    ],
    limit: 50,
  });

  return NextResponse.json({ bills });
}
