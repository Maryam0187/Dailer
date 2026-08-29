import { Op } from "sequelize";
import db from "@/server/db";
import { isAdminOnlyPaymentChargeActivity } from "@/lib/leadRoles";
import { OUTSIDE_SALE_SOURCE } from "@/lib/outsideSale";
import {
  buildPaymentChargeLogGroups,
  serializeCustomerLead,
  serializePaymentChargeLog,
} from "@/server/customers/serializeCustomer";
import { leadAssignedUserInclude, leadCreatedByInclude, leadManagerInclude, leadAgentInclude } from "@/server/leads/serializeLead";

/**
 * @param {number} customerId
 * @param {{ salesOnly?: boolean, inHouseOnly?: boolean }} scope
 */
export async function loadCustomerDetailLeads(customerId, { salesOnly = false, inHouseOnly = false } = {}) {
  const where = { customerId };
  if (salesOnly) {
    where.source = OUTSIDE_SALE_SOURCE;
  } else if (inHouseOnly) {
    where.source = { [Op.ne]: OUTSIDE_SALE_SOURCE };
  }

  const leads = await db.Lead.findAll({
    where,
    order: [["createdAt", "DESC"]],
    include: [leadAssignedUserInclude, leadCreatedByInclude, leadManagerInclude, leadAgentInclude],
  });

  return { leads };
}

export async function loadCustomerLeadAggregates(customerId, { salesOnly = false, inHouseOnly = false } = {}) {
  const where = { customerId };
  if (salesOnly) {
    where.source = OUTSIDE_SALE_SOURCE;
  } else if (inHouseOnly) {
    where.source = { [Op.ne]: OUTSIDE_SALE_SOURCE };
  }

  return db.Lead.findOne({
    attributes: [
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "leadCount"],
      [db.sequelize.fn("MIN", db.sequelize.col("createdAt")), "firstLeadAt"],
      [db.sequelize.fn("MAX", db.sequelize.col("createdAt")), "lastLeadAt"],
    ],
    where,
    raw: true,
  });
}

export async function finalizeLeadBundle(bundle, paymentMethodsSerialized) {
  if (!bundle.leads.length) return [];
  const leadIds = bundle.leads.map((lead) => lead.id);
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
  const paymentLogsByLeadId = new Map();
  for (const row of updateRows) {
    if (!isAdminOnlyPaymentChargeActivity(row)) continue;
    const list = paymentLogsByLeadId.get(row.leadId) || [];
    list.push(serializePaymentChargeLog(row));
    paymentLogsByLeadId.set(row.leadId, list);
  }
  return bundle.leads.map((lead) => {
    const paymentChargeLogs = paymentLogsByLeadId.get(lead.id) || [];
    return serializeCustomerLead(lead, {
      paymentChargeLogs,
      paymentChargeLogGroups: buildPaymentChargeLogGroups(
        paymentChargeLogs,
        paymentMethodsSerialized,
        lead,
      ),
    });
  });
}
