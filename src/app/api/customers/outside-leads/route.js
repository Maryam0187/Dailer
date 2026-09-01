import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireCustomerAccess, findAccessibleCustomer } from "@/server/customers/customerAccess";
import { createOutsideLead } from "@/server/customers/createOutsideLead";
import {
  customerAgentInclude,
  customerManagerInclude,
  serializeCustomer,
  serializeCustomerLead,
} from "@/server/customers/serializeCustomer";
import {
  leadAgentInclude,
  leadCreatedByInclude,
  leadManagerInclude,
} from "@/server/leads/serializeLead";

/** Lead-first outside flow: create outside_sale lead; customer is found/created by phone. */
export async function POST(req) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const customerId = Number(body.customerId);
  let knownCustomer = null;
  if (Number.isInteger(customerId) && customerId > 0) {
    knownCustomer = await findAccessibleCustomer(authedUser, customerId, {
      include: [customerManagerInclude, customerAgentInclude],
    });
    if (!knownCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    if (!knownCustomer.isOutside) {
      return NextResponse.json(
        { error: "Outside leads can only be added for outside customers" },
        { status: 400 },
      );
    }
  }

  try {
    const { customer, lead } = await createOutsideLead(authedUser, body, { customer: knownCustomer });
    const refreshedCustomer = await db.Customer.findByPk(customer.id, {
      include: [customerManagerInclude, customerAgentInclude],
    });
    const withUser = await db.Lead.findByPk(lead.id, {
      include: [leadCreatedByInclude, leadManagerInclude, leadAgentInclude],
    });
    return NextResponse.json(
      {
        customer: serializeCustomer(refreshedCustomer),
        lead: serializeCustomerLead(withUser),
      },
      { status: 201 },
    );
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    if (status === 500) throw err;
    return NextResponse.json({ error: err.message || "Failed to create outside lead" }, { status });
  }
}
