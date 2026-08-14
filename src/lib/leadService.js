const SERVICE_LABELS = {
  dish: "Dish",
  direct: "Direct",
  cable: "Cable",
  streams: "Streams",
};

export const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function formatLeadService(lead) {
  if (!lead?.serviceType) return "—";
  const label = SERVICE_LABELS[lead.serviceType] || lead.serviceType;
  if (lead.serviceType === "cable") {
    const name = String(lead.cableName || "").trim();
    return name ? `${label} (${name})` : label;
  }
  if (lead.serviceType === "streams") {
    const name = String(lead.streamName || "").trim();
    return name ? `${label} (${name})` : label;
  }
  return label;
}
