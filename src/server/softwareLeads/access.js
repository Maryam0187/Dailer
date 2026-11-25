import { Op } from "sequelize";
import { CAMPAIGN_SOFTWARE, normalizeCampaign } from "@/lib/campaigns";

export function canUseSoftwareLeads(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return normalizeCampaign(user.campaign) === CAMPAIGN_SOFTWARE;
}

/** Admin sees every software lead. Everyone else sees leads they own or created. */
export function softwareLeadListWhere(user) {
  if (user.role === "admin") return {};
  return {
    [Op.or]: [{ assignedUserId: user.id }, { createdByUserId: user.id }],
  };
}
