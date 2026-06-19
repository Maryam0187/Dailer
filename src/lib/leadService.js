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
  return SERVICE_LABELS[lead.serviceType] || lead.serviceType;
}
