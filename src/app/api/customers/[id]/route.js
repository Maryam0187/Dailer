import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireCustomerAccess, isOutsideManager, findAccessibleCustomer } from "@/server/customers/customerAccess";
import { isAdminOnlyPaymentChargeActivity } from "@/lib/leadRoles";
import {
  buildPaymentChargeLogGroups,
  customerAgentInclude,
  customerManagerInclude,
  serializeCustomer,
  serializeCustomerCharge,
  serializeCustomerLead,
  serializePaymentChargeLog,
  serializePaymentMethod,
} from "@/server/customers/serializeCustomer";
import {
  findCustomerByPhone,
  parseCustomerProfile,
  resolveCustomerStaffIds,
} from "@/server/customers/parseCustomerBody";
import { leadAssignedUserInclude, leadCreatedByInclude } from "@/server/leads/serializeLead";

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
  const [leads, paymentMethods, leadAgg, charges] = await Promise.all([
    managerScoped
      ? Promise.resolve([])
      : db.Lead.findAll({
      where: { customerId: id },
      order: [["createdAt", "DESC"]],
      include: [leadAssignedUserInclude, leadCreatedByInclude],
    }),
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
      : db.Lead.findOne({
      attributes: [
        [db.sequelize.fn("COUNT", db.sequelize.col("id")), "leadCount"],
        [db.sequelize.fn("MIN", db.sequelize.col("createdAt")), "firstLeadAt"],
        [db.sequelize.fn("MAX", db.sequelize.col("createdAt")), "lastLeadAt"],
      ],
      where: { customerId: id },
      raw: true,
    }),
    db.CustomerCharge.findAll({
      where: { customerId: id },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      include: [
        {
          model: db.User,
          as: "createdBy",
          attributes: ["id", "username"],
          required: false,
        },
      ],
    }),
  ]);

  const leadIds = leads.map((lead) => lead.id);
  const paymentLogsByLeadId = new Map();
  if (leadIds.length > 0) {
    const updateRows = await db.LeadUpdate.findAll({
      where: { leadId: { [Op.in]: leadIds } },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: db.User,
          as: "author",
          attributes: ["id", "username"],
          required: false,
        },
      ],
    });
    for (const row of updateRows) {
      if (!isAdminOnlyPaymentChargeActivity(row)) continue;
      const list = paymentLogsByLeadId.get(row.leadId) || [];
      list.push(serializePaymentChargeLog(row));
      paymentLogsByLeadId.set(row.leadId, list);
    }
  }

  const latestLead = leads[0] || null;
  const latestCharge = charges[0] || null;

  return NextResponse.json({
    customer: serializeCustomer(customer, {
      latestLead,
      latestCharge,
      leadCount: Number(leadAgg?.leadCount) || 0,
      firstLeadAt: leadAgg?.firstLeadAt || null,
      lastLeadAt: leadAgg?.lastLeadAt || null,
      paymentMethodCount: paymentMethods.length,
    }),
    leads: leads.map((lead) => {
      const paymentChargeLogs = paymentLogsByLeadId.get(lead.id) || [];
      return serializeCustomerLead(lead, {
        paymentChargeLogs,
        paymentChargeLogGroups: buildPaymentChargeLogGroups(
          paymentChargeLogs,
          paymentMethods,
          lead,
        ),
      });
    }),
    paymentMethods: paymentMethods.map(serializePaymentMethod),
    charges: charges.map(serializeCustomerCharge),
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
