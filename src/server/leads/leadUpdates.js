import db from "@/server/db";

export function serializeLeadUpdate(row) {
  return {
    id: row.id,
    leadId: row.leadId,
    userId: row.userId,
    username: row.author?.username || null,
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
    include: [{ model: db.User, as: "author", attributes: ["id", "username"], required: false }],
  });
  return rows.map(serializeLeadUpdate);
}
