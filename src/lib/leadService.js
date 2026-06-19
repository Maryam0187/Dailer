const SERVICE_LABELS = {
  dish: "Dish",
  direct: "Direct",
  cable: "Cable",
  streams: "Streams",
};

export function formatLeadService(lead) {
  if (!lead?.serviceType) return "—";
  return SERVICE_LABELS[lead.serviceType] || lead.serviceType;
}
