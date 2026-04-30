import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const bill = await db.Bill.findByPk(id);
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  if (!bill.pdfPath) return NextResponse.json({ error: "PDF not generated yet" }, { status: 404 });

  try {
    const file = await fs.readFile(bill.pdfPath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bill-${bill.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read PDF file" }, { status: 500 });
  }
}
