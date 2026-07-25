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
