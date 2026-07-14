import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { isAdminOnlyPaymentChargeActivityBody } from "@/lib/leadRoles";
import {
  buildPaymentChargeLogGroups,
  serializeCustomer,
  serializeCustomerLead,
  serializePaymentChargeLog,
  serializePaymentMethod,
} from "@/server/customers/serializeCustomer";
import { leadAssignedUserInclude, leadCreatedByInclude } from "@/server/leads/serializeLead";

export async function GET(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }

  const customer = await db.Customer.findByPk(id);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [leads, paymentMethods, leadAgg] = await Promise.all([
    db.Lead.findAll({
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
    db.Lead.findOne({
      attributes: [
        [db.sequelize.fn("COUNT", db.sequelize.col("id")), "leadCount"],
        [db.sequelize.fn("MIN", db.sequelize.col("createdAt")), "firstLeadAt"],
        [db.sequelize.fn("MAX", db.sequelize.col("createdAt")), "lastLeadAt"],
      ],
      where: { customerId: id },
      raw: true,
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
      if (!isAdminOnlyPaymentChargeActivityBody(row.body)) continue;
      const list = paymentLogsByLeadId.get(row.leadId) || [];
      list.push(serializePaymentChargeLog(row));
      paymentLogsByLeadId.set(row.leadId, list);
    }
  }

  const latestLead = leads[0] || null;

  return NextResponse.json({
    customer: serializeCustomer(customer, {
      latestLead,
      leadCount: Number(leadAgg?.leadCount) || 0,
      firstLeadAt: leadAgg?.firstLeadAt || null,
      lastLeadAt: leadAgg?.lastLeadAt || null,
      paymentMethodCount: paymentMethods.length,
    }),
    leads: leads.map((lead) =>
      serializeCustomerLead(lead, {
        paymentChargeLogGroups: buildPaymentChargeLogGroups(
          paymentLogsByLeadId.get(lead.id) || [],
          paymentMethods,
          lead,
        ),
      }),
    ),
    paymentMethods: paymentMethods.map(serializePaymentMethod),
  });
}
