import db from "@/server/db";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";

/**
 * Set or clear sharedViewerUserId (does not change assignedUserId / createdByUserId).
 * Returns { changed, body } for auditing.
 */
export async function applySharedViewerChange({
  lead,
  nextViewerId,
  actorUserId,
  req,
  usernameById = null,
  metadataExtra = null,
}) {
  const previousId = lead.sharedViewerUserId ?? null;
  const normalizedNext =
    nextViewerId == null || nextViewerId === ""
      ? null
      : Number(nextViewerId);

  if (normalizedNext != null && (!Number.isInteger(normalizedNext) || normalizedNext <= 0)) {
    throw new Error("Invalid shared viewer");
  }

  if (previousId === normalizedNext) {
    return { changed: false };
  }

  let names = usernameById;
  if (!names) {
    const lookupIds = [];
    if (normalizedNext != null) lookupIds.push(normalizedNext);
    if (previousId != null) lookupIds.push(previousId);
    const users =
      lookupIds.length > 0
        ? await db.User.findAll({
            where: { id: lookupIds },
            attributes: ["id", "username"],
          })
        : [];
    names = new Map(users.map((u) => [u.id, u.username]));
  }

  let body;
  if (normalizedNext == null) {
    const previousName = previousId
      ? names.get(previousId) ?? `user #${previousId}`
      : null;
    body = previousName ? `Shared view cleared (was ${previousName})` : "Shared view cleared";
  } else {
    const nextName = names.get(normalizedNext) ?? `user #${normalizedNext}`;
    const previousName = previousId
      ? names.get(previousId) ?? `user #${previousId}`
      : null;
    body = previousName
      ? `Shared view with ${nextName} (from ${previousName})`
      : `Shared view with ${nextName}`;
  }

  await lead.update({ sharedViewerUserId: normalizedNext });

  await createLeadUpdate({
    leadId: lead.id,
    userId: actorUserId,
    type: "lead_edit",
    body,
  });

  await logLeadUserActivity({
    req,
    userId: actorUserId,
    action: "lead_shared_view",
    leadId: lead.id,
    metadata: {
      leadName: lead.fullName || null,
      summary: body,
      sharedViewerUserId: normalizedNext,
      previousSharedViewerUserId: previousId,
      ...(metadataExtra || {}),
    },
  });

  return { changed: true, body };
}
