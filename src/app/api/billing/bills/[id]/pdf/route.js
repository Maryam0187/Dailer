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

  try {
    // Remove stored PDF (if any), then delete the bill for this range.
    // BillItems are removed via FK onDelete CASCADE.
    await deleteBillPdf(bill);
    await bill.destroy();
    return NextResponse.json({ ok: true, id: Number(id), deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete bill" },
      { status: 500 },
    );
  }
}
