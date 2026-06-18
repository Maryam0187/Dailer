import db from "@/server/db";
import { maskPhoneLastFour, shouldRedactLeadPhones } from "@/lib/maskPhone";

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

export function serializeLead(lead, lastCallAt = null, viewerRole = null) {
  const phonesRedacted = shouldRedactLeadPhones(viewerRole);
  return {
    id: lead.id,
    phone: phonesRedacted ? maskPhoneLastFour(lead.phone) : lead.phone,
    fullName: lead.fullName,
    cellNumber: phonesRedacted
      ? lead.cellNumber
        ? maskPhoneLastFour(lead.cellNumber)
        : null
      : lead.cellNumber,
    phonesRedacted,
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
