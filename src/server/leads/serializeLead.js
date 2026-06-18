import db from "@/server/db";
import { maskPhoneLastFour, shouldRedactLeadPhones } from "@/lib/maskPhone";

export const leadAssignedUserInclude = {
  model: db.User,
  as: "assignedUser",
  attributes: ["id", "username", "role"],
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

export const leadCreatedByInclude = {
  model: db.User,
  as: "createdBy",
  attributes: ["id", "username", "role"],
  required: false,
};

export const leadListIncludes = [leadAssignedUserInclude, leadCreatedByInclude];

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
    assignedUserRole: lead.assignedUser?.role ?? null,
    supervisorUsername: lead.assignedUser?.supervisor?.username ?? null,
    createdByUserId: lead.createdByUserId,
    createdByUsername: lead.createdBy?.username ?? null,
    createdByUserRole: lead.createdBy?.role ?? null,
    createdFromCallLogId: lead.createdFromCallLogId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastCallAt,
  };
}
