export const SHARE_VIEWER_STATUSES = [
  { value: "pending", label: "Pending", shortLabel: "Pnd", tone: "zinc" },
  { value: "in_progress", label: "In progress", shortLabel: "IP", tone: "sky" },
  { value: "cancelled", label: "Cancelled", shortLabel: "Cxl", tone: "red" },
  { value: "no_contact", label: "No contact", shortLabel: "NC", tone: "amber" },
  { value: "lead_created", label: "Lead created", shortLabel: "New", tone: "emerald" },
];

/** Statuses the admin or share user can set by hand. Lead created is set by Create lead. */
export const MANUAL_SHARE_VIEWER_STATUSES = SHARE_VIEWER_STATUSES.filter(
  (status) => status.value !== "lead_created",
);

export const SHARE_VIEWER_STATUS_VALUES = new Set(SHARE_VIEWER_STATUSES.map((status) => status.value));
export const MANUAL_SHARE_VIEWER_STATUS_VALUES = new Set(
  MANUAL_SHARE_VIEWER_STATUSES.map((status) => status.value),
);

const STATUS_BY_VALUE = Object.fromEntries(SHARE_VIEWER_STATUSES.map((status) => [status.value, status]));

export function shareViewerStatusMeta(value) {
  return STATUS_BY_VALUE[value] || null;
}

export function shareViewerStatusLabel(value) {
  return shareViewerStatusMeta(value)?.label || "Pending";
}

/** Default when a lead is shared. A lead already created from this share stays Lead created. */
export function initialSharedViewerStatus(lead) {
  if (lead?.sharedCreatedLeadId) return "lead_created";
  return "pending";
}
