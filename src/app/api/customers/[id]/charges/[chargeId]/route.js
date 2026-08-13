import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireCustomerAccess, findAccessibleCustomer } from "@/server/customers/customerAccess";

/** Admin or outside manager: remove a mistaken outside-customer charge. */
export async function DELETE(_req, { params }) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const { id: rawCustomerId, chargeId: rawChargeId } = await params;
  const customerId = Number(rawCustomerId);
  const chargeId = Number(rawChargeId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }
  if (!Number.isInteger(chargeId) || chargeId <= 0) {
    return NextResponse.json({ error: "Invalid charge id" }, { status: 400 });
  }

  const customer = await findAccessibleCustomer(authedUser, customerId, {
    attributes: ["id", "isOutside"],
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (!customer.isOutside) {
    return NextResponse.json(
      { error: "Charges without a lead are only for outside customers" },
      { status: 400 },
    );
  }

  const row = await db.CustomerCharge.findOne({ where: { id: chargeId, customerId } });
  if (!row) return NextResponse.json({ error: "Charge not found" }, { status: 404 });

  await row.destroy();
  await db.Customer.update({ updatedAt: new Date() }, { where: { id: customerId } });
  return NextResponse.json({ ok: true });
}
