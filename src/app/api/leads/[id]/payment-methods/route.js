import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { canAccessLead } from "@/server/leads/leadAccess";
import { serializeChargeablePaymentMethod } from "@/server/customers/serializeChargeablePaymentMethod";

/** Admin-only: list saved payment methods for the lead's customer (safe summaries). */
export async function GET(_req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(id, {
    attributes: ["id", "customerId", "assignedUserId", "createdByUserId", "processorUserId"],
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!lead.customerId) {
    return NextResponse.json({ paymentMethods: [], customerId: null });
  }

  const rows = await db.CustomerPaymentMethod.findAll({
    where: { customerId: lead.customerId },
    order: [
      ["isDefault", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  return NextResponse.json({
    customerId: lead.customerId,
    paymentMethods: rows.map(serializeChargeablePaymentMethod),
  });
}
