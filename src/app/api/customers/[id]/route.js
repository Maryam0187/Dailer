import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireCustomerAccess, isOutsideManager, findAccessibleCustomer } from "@/server/customers/customerAccess";
import {
  customerAgentInclude,
  customerManagerInclude,
  serializeCustomer,
  serializeCustomerCharge,
  serializePaymentMethod,
} from "@/server/customers/serializeCustomer";
import {
  loadCustomerDetailLeads,
  loadCustomerLeadAggregates,
  finalizeLeadBundle,
} from "@/server/customers/loadCustomerDetailLeads";
import {
  findCustomerByPhone,
  parseCustomerProfile,
  resolveCustomerStaffIds,
} from "@/server/customers/parseCustomerBody";

export async function GET(_req, { params }) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }

  const customer = await findAccessibleCustomer(authedUser, id, {
    include: [customerManagerInclude, customerAgentInclude],
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const managerScoped = isOutsideManager(authedUser);
  const isOutsideCustomer = Boolean(customer.isOutside);

  const [inHouseBundle, salesBundle, paymentMethods, inHouseAgg, salesAgg, legacyCharges] =
    await Promise.all([
      managerScoped
        ? Promise.resolve({ leads: [] })
        : loadCustomerDetailLeads(id, { inHouseOnly: true }),
      isOutsideCustomer
        ? loadCustomerDetailLeads(id, { salesOnly: true })
        : Promise.resolve({ leads: [] }),
      db.CustomerPaymentMethod.findAll({
        where: { customerId: id },
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
      }),
      managerScoped
        ? Promise.resolve(null)
        : loadCustomerLeadAggregates(id, { inHouseOnly: true }),
      isOutsideCustomer
        ? loadCustomerLeadAggregates(id, { salesOnly: true })
        : Promise.resolve(null),
      isOutsideCustomer
        ? db.CustomerCharge.findAll({
            where: { customerId: id, leadId: null },
            order: [["createdAt", "DESC"], ["id", "DESC"]],
            include: [
              {
                model: db.User,
                as: "createdBy",
                attributes: ["id", "username"],
                required: false,
              },
            ],
          })
        : Promise.resolve([]),
    ]);

  const paymentMethodsSerialized = paymentMethods.map(serializePaymentMethod);

  const [leads, sales] = await Promise.all([
    finalizeLeadBundle(inHouseBundle, paymentMethodsSerialized),
    finalizeLeadBundle(salesBundle, paymentMethodsSerialized),
  ]);

  const latestLead = inHouseBundle.leads[0] || null;
  const latestSale = salesBundle.leads[0] || null;
  const latestLegacyCharge = legacyCharges[0] || null;

  const inHouseCount = Number(inHouseAgg?.leadCount) || 0;
  const salesCount = Number(salesAgg?.leadCount) || 0;

  return NextResponse.json({
    customer: serializeCustomer(customer, {
      latestLead,
      latestCharge: latestLegacyCharge,
      latestSale,
      leadCount: managerScoped ? salesCount : inHouseCount,
      salesCount,
      firstLeadAt: managerScoped ? salesAgg?.firstLeadAt || null : inHouseAgg?.firstLeadAt || null,
      lastLeadAt: managerScoped ? salesAgg?.lastLeadAt || null : inHouseAgg?.lastLeadAt || null,
      firstSaleAt: salesAgg?.firstLeadAt || null,
      lastSaleAt: salesAgg?.lastLeadAt || null,
      paymentMethodCount: paymentMethods.length,
    }),
    leads,
    sales,
    paymentMethods: paymentMethodsSerialized,
    /** Legacy flat charges (leadId null). New work uses `sales`. */
    charges: legacyCharges.map(serializeCustomerCharge),
  });
}

/** Admin: update a customer profile. Outside managers may update their outside customers. */
export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireCustomerAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }

  const customer = await findAccessibleCustomer(authedUser, id);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const isOutside = Boolean(customer.isOutside);
  if (!isOutside && isOutsideManager(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { data, errors } = parseCustomerProfile(body, {
    requireName: false,
    requirePhone: false,
  });
  if (errors.length) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }
  if (!isOutside) {
    delete data.managerId;
    delete data.agentId;
    delete data.chargeAmount;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (isOutside) {
    if (data.managerId === null) {
      return NextResponse.json({ error: "Manager is required" }, { status: 400 });
    }
    if (isOutsideManager(authedUser)) {
      if (data.managerId !== undefined && Number(data.managerId) !== Number(authedUser.id)) {
        return NextResponse.json({ error: "Cannot reassign this customer" }, { status: 403 });
      }
      delete data.managerId;
    }

    const nextManagerId = data.managerId !== undefined ? data.managerId : customer.managerId;
    if (data.managerId !== undefined && data.agentId === undefined) {
      data.agentId = null;
    }
    const nextAgentId = data.agentId !== undefined ? data.agentId : customer.agentId;
    if (data.managerId !== undefined || data.agentId !== undefined) {
      const staff = await resolveCustomerStaffIds({
        managerId: nextManagerId,
        agentId: nextAgentId,
      });
      if (staff.error) {
        return NextResponse.json({ error: staff.error }, { status: 400 });
      }
    }
  }

  if (data.phone && data.phone !== customer.phone) {
    const existing = await findCustomerByPhone(data.phone);
    if (existing && Number(existing.id) !== id) {
      return NextResponse.json(
        { error: "A customer with this phone already exists" },
        { status: 409 },
      );
    }
  }

  try {
    await customer.update(data);
  } catch (err) {
    if (String(err?.name).includes("SequelizeUniqueConstraintError")) {
      return NextResponse.json(
        { error: "A customer with this phone already exists" },
        { status: 409 },
      );
    }
    throw err;
  }

  const refreshed = await db.Customer.findByPk(id, {
    include: [customerManagerInclude, customerAgentInclude],
  });

  return NextResponse.json({
    customer: serializeCustomer(refreshed, {
      leadCount: 0,
      paymentMethodCount: null,
    }),
  });
}
