export const CAMPAIGN_TV = "tv";
export const CAMPAIGN_SOFTWARE = "software";

const CAMPAIGN_VALUES = new Set([CAMPAIGN_TV, CAMPAIGN_SOFTWARE]);

/** @param {unknown} value @returns {"tv" | "software" | null} */
export function parseCampaign(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CAMPAIGN_VALUES.has(normalized) ? normalized : null;
}

/** Missing or unknown campaign is the existing TV sale. */
export function normalizeCampaign(value) {
  return parseCampaign(value) || CAMPAIGN_TV;
}

export function campaignLabel(campaign) {
  if (campaign === CAMPAIGN_SOFTWARE) return "Software";
  return "TV";
}
