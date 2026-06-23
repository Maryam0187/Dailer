import { stripHtml } from "@/lib/richText";
import { logUserActivity } from "@/server/activity/logUserActivity";

const LEAD_UPDATE_ACTIONS = {
  created: "lead_created",
  status_change: "lead_status_change",
  note_edit: "lead_note_edit",
  breakdown_edit: "lead_breakdown_edit",
  lead_edit: "lead_updated",
  comment: "lead_comment",
};

export function leadActivityAction(type) {
  return LEAD_UPDATE_ACTIONS[type] || "lead_updated";
}

export async function logLeadUserActivity({
  req,
  userId,
  action,
  leadId,
  metadata = null,
}) {
  return logUserActivity({
    req,
    userId,
    action,
    entityType: "lead",
    entityId: leadId,
    metadata,
  });
}

export async function logLeadUpdateActivity({
  req,
  userId,
  leadId,
  leadName,
  entry,
}) {
  const metadata = { leadName: leadName || null };
  if (entry.type === "status_change") {
    metadata.previousStatus = entry.previousStatus;
    metadata.newStatus = entry.newStatus;
  } else if (entry.body) {
    const plainSummary = stripHtml(entry.body);
    metadata.summary =
      plainSummary.length > 200 ? `${plainSummary.slice(0, 197)}…` : plainSummary;
  }

  return logLeadUserActivity({
    req,
    userId,
    action: leadActivityAction(entry.type),
    leadId,
    metadata,
  });
}
