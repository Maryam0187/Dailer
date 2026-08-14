import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireCustomerAccess, findAccessibleCustomer } from "@/server/customers/customerAccess";
import { serializeCustomerCharge } from "@/server/customers/serializeCustomer";
import {
  normalizeLeadPaymentChargeAmount,
  normalizeLeadPaymentChargeStatus,
} from "@/lib/leadWorkflow";
import { resolvePaymentProcessor } from "@/server/paymentProcessors/registry";

function trimReason(value, maxLen = 2000) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

async function loadCharge(id) {
  return db.CustomerCharge.findByPk(id, {
    include: [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });
}

/** Admin or outside manager: log a charge on an outside customer (no lead). */
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
      { error: "Charges without a lead are only for outside customers" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const status = normalizeLeadPaymentChargeStatus(body.status);
  if (!status) {
    return NextResponse.json({ error: "Charge status is required" }, { status: 400 });
  }

  const pmId = Number(body.customerPaymentMethodId);
  if (!Number.isInteger(pmId) || pmId <= 0) {
    return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
  }
  const pm = await db.CustomerPaymentMethod.findOne({
    where: { id: pmId, customerId },
    attributes: ["id", "type"],
  });
  if (!pm) {
    return NextResponse.json({ error: "Payment method not found for this customer" }, { status: 404 });
  }

  let amount = normalizeLeadPaymentChargeAmount(body.amount);
  if (amount === undefined) {
    return NextResponse.json({ error: "Invalid charge amount" }, { status: 400 });
  }
  if (amount == null) {
    const saved = customer.chargeAmount != null ? Number(customer.chargeAmount) : null;
    amount = Number.isFinite(saved) ? saved : null;
  }
  if ((status === "charged" || status === "chargeback") && amount == null) {
    return NextResponse.json({ error: "Save a charge amount first" }, { status: 400 });
  }

  const processorOptional = pm.type === "check_mail";
  let processorCode = null;
  if (body.processor) {
    const resolved = await resolvePaymentProcessor(body.processor);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid payment processor" }, { status: 400 });
    }
    processorCode = resolved.code;
  } else if (!processorOptional) {
    return NextResponse.json({ error: "Payment processor is required" }, { status: 400 });
  }

  let declineReason = null;
  if (status === "declined") {
    declineReason = trimReason(body.declineReason);
    if (!declineReason) {
      return NextResponse.json({ error: "Decline reason is required" }, { status: 400 });
    }
  }

  const row = await db.CustomerCharge.create({
    customerId,
    customerPaymentMethodId: pm.id,
    status,
    amount,
    processor: processorCode,
    declineReason,
    createdByUserId: authedUser.id,
  });
  const customerUpdates = { updatedAt: new Date() };
  if (amount != null && Number(customer.chargeAmount) !== Number(amount)) {
    customerUpdates.chargeAmount = amount;
  }
  await customer.update(customerUpdates);

  const withUser = await loadCharge(row.id);
  return NextResponse.json({ charge: serializeCustomerCharge(withUser) }, { status: 201 });
}
