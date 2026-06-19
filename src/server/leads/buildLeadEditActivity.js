import { formatLeadService } from "@/lib/leadService";

const EDIT_FIELD_LABELS = {
  fullName: "Full name",
  cellNumber: "Cell",
  company: "Company",
  email: "Email",
  city: "City",
  state: "State",
  zipCode: "Zip code",
  serviceType: "Service",
  cableName: "Cable name",
  streamName: "Stream name",
  nextCallbackAt: "Callback",
};

function displayValue(key, value) {
  if (value == null || value === "") return "(empty)";
  if (key === "serviceType") return formatLeadService({ serviceType: value });
  if (key === "nextCallbackAt") {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return String(value);
}

function valuesEqual(key, left, right) {
  if (key === "nextCallbackAt") {
    const l = left ? new Date(left).getTime() : null;
    const r = right ? new Date(right).getTime() : null;
    return l === r;
  }
  return String(left ?? "") === String(right ?? "");
}

/** Fields that belong in a general lead edit activity (not notes/breakdown/status). */
const LEAD_EDIT_KEYS = new Set(Object.keys(EDIT_FIELD_LABELS));

export function buildLeadEditActivityBody(lead, update) {
  const lines = [];

  for (const key of LEAD_EDIT_KEYS) {
    if (!(key in update)) continue;
    const previous = lead[key] ?? null;
    const next = update[key] ?? null;
    if (valuesEqual(key, previous, next)) continue;
    lines.push(
      `${EDIT_FIELD_LABELS[key]}: ${displayValue(key, previous)} → ${displayValue(key, next)}`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

export function hasLeadEditChanges(lead, update) {
  return Boolean(buildLeadEditActivityBody(lead, update));
}
