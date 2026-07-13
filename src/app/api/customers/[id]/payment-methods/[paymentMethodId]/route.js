import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializePaymentMethod } from "@/server/customers/serializeCustomer";
import {
  parsePaymentBody,
  clearUnusedPaymentFields,
} from "@/server/customers/parsePaymentBody";

export async function PATCH(req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId, paymentMethodId: rawPmid } = await params;
  const customerId = Number(rawId);
  const paymentMethodId = Number(rawPmid);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }
  if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
    return NextResponse.json({ error: "Invalid payment method id" }, { status: 400 });
  }

  const row = await db.CustomerPaymentMethod.findOne({
    where: { id: paymentMethodId, customerId },
  });
  if (!row) return NextResponse.json({ error: "Payment method not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { data, errors } = parsePaymentBody(body || {}, { partial: true });
  if (errors.length) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const nextType = data.type || row.type;
  const cleaned = clearUnusedPaymentFields(nextType, { ...row.toJSON(), ...data });
  // Only persist fields that belong on the model update payload
  const update = {
    type: nextType,
    isDefault: data.isDefault !== undefined ? Boolean(data.isDefault) : row.isDefault,
    nameOnCard: cleaned.nameOnCard,
    cardType: cleaned.cardType,
    brand: cleaned.brand,
    cardNumber: cleaned.cardNumber,
    expDate: cleaned.expDate,
    cvv: cleaned.cvv,
    routingNumber: cleaned.routingNumber,
    accountNumber: cleaned.accountNumber,
    checkNumber: cleaned.checkNumber,
    bankName: cleaned.bankName,
    notes: cleaned.notes !== undefined ? cleaned.notes : row.notes,
  };

  await db.sequelize.transaction(async (transaction) => {
    if (update.isDefault === true) {
      await db.CustomerPaymentMethod.update(
        { isDefault: false },
        {
          where: { customerId, id: { [Op.ne]: paymentMethodId }, isDefault: true },
          transaction,
        },
      );
    }
    await row.update(update, { transaction });
  });

  const withUser = await db.CustomerPaymentMethod.findByPk(row.id, {
    include: [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });

  return NextResponse.json({ paymentMethod: serializePaymentMethod(withUser) });
}

export async function DELETE(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId, paymentMethodId: rawPmid } = await params;
  const customerId = Number(rawId);
  const paymentMethodId = Number(rawPmid);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }
  if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
    return NextResponse.json({ error: "Invalid payment method id" }, { status: 400 });
  }

  const row = await db.CustomerPaymentMethod.findOne({
    where: { id: paymentMethodId, customerId },
  });
  if (!row) return NextResponse.json({ error: "Payment method not found" }, { status: 404 });

  await row.destroy();
  return NextResponse.json({ ok: true });
}
