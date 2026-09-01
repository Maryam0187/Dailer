import { Op } from "sequelize";
import db from "@/server/db";
import { PAYMENT_LEAD_UPDATE_TYPES } from "@/lib/leadWorkflow";

/**
 * Whether this sale already has a one-time payment outcome in history.
 * Declines are allowed multiple times; charged and chargeback are once each.
 */
export async function leadHasPaymentOutcome(leadId, status) {
  if (status !== "charged" && status !== "chargeback") return false;

  const type =
    status === "charged"
      ? PAYMENT_LEAD_UPDATE_TYPES.charged
      : PAYMENT_LEAD_UPDATE_TYPES.chargeback;
  const bodyPrefix = status === "charged" ? "Payment charged%" : "Payment chargeback%";

  const existing = await db.LeadUpdate.findOne({
    where: {
      leadId,
      [Op.or]: [
        { type },
        {
          type: "lead_phase_change",
          body: { [Op.like]: bodyPrefix },
        },
      ],
    },
    attributes: ["id"],
  });
  return Boolean(existing);
}

/**
 * Remove one-time charge outcomes from history so an admin can undo a mistaken charge.
 * Deletes charged and chargeback LeadUpdates (typed + legacy body). Declines are kept.
 * Also removes matching CustomerCharge rows for this lead.
 * @returns {Promise<number>} LeadUpdate rows destroyed
 */
export async function removeLeadPaymentChargeHistory(leadId) {
  const id = Number(leadId);
  if (!Number.isInteger(id) || id <= 0) return 0;

  const destroyed = await db.LeadUpdate.destroy({
    where: {
      leadId: id,
      [Op.or]: [
        { type: PAYMENT_LEAD_UPDATE_TYPES.charged },
        { type: PAYMENT_LEAD_UPDATE_TYPES.chargeback },
        {
          type: "lead_phase_change",
          body: { [Op.like]: "Payment charged%" },
        },
        {
          type: "lead_phase_change",
          body: { [Op.like]: "Payment chargeback%" },
        },
      ],
    },
  });

  await db.CustomerCharge.destroy({
    where: {
      leadId: id,
      status: { [Op.in]: ["charged", "chargeback"] },
    },
  });

  return destroyed;
}
