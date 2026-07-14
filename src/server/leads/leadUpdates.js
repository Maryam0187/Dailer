import db from "@/server/db";
import {
  isAdminOnlyPaymentChargeActivityBody,
  shouldHideLeadNotes,
  shouldRestrictProcessorLeadActivity,
} from "@/lib/leadRoles";

export function serializeLeadUpdate(row) {
  return {
    id: row.id,
    leadId: row.leadId,
    userId: row.userId,
    username: row.author?.username || null,
    authorRole: row.author?.role || null,
    type: row.type,
    body: row.body || null,
    previousStatus: row.previousStatus || null,
    newStatus: row.newStatus || null,
    createdAt: row.createdAt,
  };
}

export async function createLeadUpdate({ leadId, userId, type, body, previousStatus, newStatus }) {
  return db.LeadUpdate.create({
    leadId,
    userId,
    type,
    body: body || null,
    previousStatus: previousStatus || null,
    newStatus: newStatus || null,
  });
}

export async function fetchLeadUpdates(leadId) {
  const rows = await db.LeadUpdate.findAll({
    where: { leadId },
    order: [["createdAt", "DESC"]],
    include: [{ model: db.User, as: "author", attributes: ["id", "username", "role"], required: false }],
  });
  return rows.map(serializeLeadUpdate);
}

/** Strip notes / non-own activity that processors must not see. */
export function filterLeadUpdatesForViewer(updates, viewer, lead) {
  const viewerRole = viewer?.role;
  const viewerId = viewer?.id != null ? Number(viewer.id) : null;
  // Payment charge/link logs live on Customers → Lead history, not the lead timeline.
  let next = updates.filter((u) => !isAdminOnlyPaymentChargeActivityBody(u.body));
  if (shouldHideLeadNotes(viewerRole, lead)) {
    next = next
      .filter((u) => u.type !== "note_edit")
      .map((u) => {
        if (u.type === "created" && String(u.body || "").startsWith("Initial notes:")) {
          return { ...u, body: "Lead created" };
        }
        return u;
      });
  }
  if (shouldRestrictProcessorLeadActivity(viewerRole, lead) && viewerId != null) {
    next = next.filter((u) => u.type === "comment" || Number(u.userId) === viewerId);
  }
  return next;
}
