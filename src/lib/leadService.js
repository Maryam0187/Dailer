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

export const CANADA_SERVICE_OPTIONS = [
  { value: "bell_tv", label: "Bell TV" },
  { value: "shaw_direct", label: "Shaw Direct (Rogers)" },
];

const ALL_SERVICE_LABELS = {
  ...SERVICE_LABELS,
  ...Object.fromEntries(CANADA_SERVICE_OPTIONS.map((option) => [option.value, option.label])),
};

export const ALL_SERVICE_TYPES = new Set(Object.keys(ALL_SERVICE_LABELS));

const USA_SERVICE_TYPES = new Set(SERVICE_TYPE_OPTIONS.map((option) => option.value));
const CANADA_SERVICE_TYPES = new Set(CANADA_SERVICE_OPTIONS.map((option) => option.value));

export function serviceMatchesCountry(serviceType, country) {
  if (!serviceType) return true;
  const allowed = country === "canada" ? CANADA_SERVICE_TYPES : USA_SERVICE_TYPES;
  return allowed.has(serviceType);
}

export function formatLeadService(lead) {
  if (!lead?.serviceType) return "—";
  const label = ALL_SERVICE_LABELS[lead.serviceType] || lead.serviceType;
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
