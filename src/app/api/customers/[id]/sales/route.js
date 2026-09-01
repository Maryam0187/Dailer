import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireCustomerAccess, findAccessibleCustomer } from "@/server/customers/customerAccess";
import { createOutsideSaleLead } from "@/server/customers/createOutsideSaleLead";
import { serializeCustomerLead } from "@/server/customers/serializeCustomer";
import {
  leadAgentInclude,
  leadCreatedByInclude,
  leadManagerInclude,
} from "@/server/leads/serializeLead";

/** Create a new outside sale (lead-like row) for an outside customer. */
export async function POST(req, { params }) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const customerId = Number(rawId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }

  const customer = await findAccessibleCustomer(authedUser, customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (!customer.isOutside) {
    return NextResponse.json(
      { error: "Sales can only be added for outside customers" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));

  try {
    const lead = await createOutsideSaleLead(customer, authedUser, body);
    const withUser = await db.Lead.findByPk(lead.id, {
      include: [leadCreatedByInclude, leadManagerInclude, leadAgentInclude],
    });
    return NextResponse.json({ sale: serializeCustomerLead(withUser) }, { status: 201 });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    if (status === 500) throw err;
    return NextResponse.json({ error: err.message || "Failed to create sale" }, { status });
  }
}
