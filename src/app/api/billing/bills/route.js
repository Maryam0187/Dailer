import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { teamManagerLabel } from "@/lib/teamManagerLabel";

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
      "totalAmount",
      "usageBreakdown",
      "userRecords",
      "pdfPath",
      "managerId",
      "createdAt",
    ],
    include: [
      {
        model: db.User,
        as: "teamManager",
        attributes: ["id", "username", "displayName"],
        required: false,
      },
    ],
    limit: 50,
  });

  return NextResponse.json({
    bills: bills.map((b) => ({
      id: b.id,
      fromDate: b.fromDate,
      toDate: b.toDate,
      currency: b.currency,
      totalAmount: b.totalAmount,
      categories: Array.isArray(b.usageBreakdown) ? b.usageBreakdown : [],
      userRecords: Array.isArray(b.userRecords) ? b.userRecords : [],
      managerId: b.managerId,
      managerUsername: b.teamManager?.username || null,
      teamLabel: b.managerId
        ? teamManagerLabel(b.teamManager) || `Team #${b.managerId} (Manager)`
        : null,
      accountScope: b.managerId ? "team" : "main",
      createdAt: b.createdAt,
      hasPdf: Boolean(b.pdfPath),
      pdfUrl: b.pdfPath ? `/api/billing/bills/${b.id}/pdf` : null,
    })),
  });
}
