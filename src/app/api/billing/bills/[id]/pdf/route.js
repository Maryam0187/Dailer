import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { deleteBillPdf, readBillPdfBytes } from "@/server/billing/billPdfStorage";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const bill = await db.Bill.findByPk(id);
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  try {
    const file = await readBillPdfBytes(bill);
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bill-${bill.id}.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to read PDF file" },
      { status: err?.status || 500 },
    );
  }
}

export async function DELETE(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const bill = await db.Bill.findByPk(id);
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  if (!bill.pdfPath) {
    return NextResponse.json({ error: "No PDF to delete" }, { status: 404 });
  }

  try {
    await deleteBillPdf(bill);
    return NextResponse.json({ ok: true, id: bill.id, hasPdf: false });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete PDF" },
      { status: 500 },
    );
  }
}
