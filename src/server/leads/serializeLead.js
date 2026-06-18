import db from "@/server/db";

export const leadAssignedUserInclude = {
  model: db.User,
  as: "assignedUser",
  attributes: ["id", "username"],
  required: false,
  include: [
    {
      model: db.User,
      as: "supervisor",
      attributes: ["id", "username"],
      required: false,
    },
  ],
};

export function serializeLead(lead, lastCallAt = null) {
  return {
    id: lead.id,
    phone: lead.phone,
    fullName: lead.fullName,
    cellNumber: lead.cellNumber,
    company: lead.company,
    email: lead.email,
    city: lead.city,
    state: lead.state,
    zipCode: lead.zipCode,
    notes: lead.notes,
    status: lead.status,
    source: lead.source,
    nextCallbackAt: lead.nextCallbackAt,
    assignedUserId: lead.assignedUserId,
    assignedUsername: lead.assignedUser?.username ?? null,
    supervisorUsername: lead.assignedUser?.supervisor?.username ?? null,
    createdByUserId: lead.createdByUserId,
    createdFromCallLogId: lead.createdFromCallLogId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastCallAt,
  };
}
