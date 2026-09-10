import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireCustomerAccess, findAccessibleCustomer } from "@/server/customers/customerAccess";
import { serializePaymentMethod } from "@/server/customers/serializeCustomer";
import {
  parsePaymentBody,
  clearUnusedPaymentFields,
} from "@/server/customers/parsePaymentBody";
import { canViewPaymentAdminNotes } from "@/lib/leadRoles";

async function clearOtherDefaults(customerId, exceptId, transaction) {
  const where = { customerId, isDefault: true };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  await db.CustomerPaymentMethod.update(
    { isDefault: false },
    { where, transaction },
  );
}

export async function GET(_req, { params }) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const customerId = Number(rawId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }

  const customer = await findAccessibleCustomer(authedUser, customerId, { attributes: ["id"] });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const rows = await db.CustomerPaymentMethod.findAll({
    where: { customerId },
    order: [
      ["isDefault", "DESC"],
      ["createdAt", "DESC"],
    ],
    include: [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });

  return NextResponse.json({
    paymentMethods: rows.map((row) =>
      serializePaymentMethod(row, { viewerRole: authedUser.role }),
    ),
  });
}

export async function POST(req, { params }) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const customerId = Number(rawId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }

  const customer = await findAccessibleCustomer(authedUser, customerId, { attributes: ["id"] });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { data, errors } = parsePaymentBody(body, { partial: false });
  if (errors.length) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }

  const cleaned = clearUnusedPaymentFields(data.type, data);
  if (!canViewPaymentAdminNotes(authedUser.role)) {
    cleaned.notes = null;
  }

  const row = await db.sequelize.transaction(async (transaction) => {
    if (cleaned.isDefault) {
      await clearOtherDefaults(customerId, null, transaction);
    }
    return db.CustomerPaymentMethod.create(
      {
        customerId,
        createdByUserId: authedUser.id,
        isDefault: Boolean(cleaned.isDefault),
        ...cleaned,
      },
      { transaction },
    );
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

  return NextResponse.json(
    {
      paymentMethod: serializePaymentMethod(withUser, { viewerRole: authedUser.role }),
    },
    { status: 201 },
  );
}
