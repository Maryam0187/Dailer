import db from "@/server/db";
import { maskPhoneLastFour, shouldRedactLeadPhones } from "@/lib/maskPhone";
import { canViewLeadPaymentChargeInfo, shouldHideLeadNotes } from "@/lib/leadRoles";

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

export const leadProcessorUserInclude = {
  model: db.User,
  as: "processorUser",
  attributes: ["id", "username", "role"],
  required: false,
};

export const leadListIncludes = [leadAssignedUserInclude, leadCreatedByInclude, leadProcessorUserInclude];

export function serializeLead(lead, lastCallAt = null, viewerRole = null) {
  const phonesRedacted = shouldRedactLeadPhones(viewerRole);
  const notesHidden = shouldHideLeadNotes(viewerRole, lead);
  const paymentChargeVisible = canViewLeadPaymentChargeInfo(viewerRole);
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
    serviceType: lead.serviceType,
    cableName: lead.cableName,
    streamName: lead.streamName,
    breakdown: lead.breakdown,
    notes: notesHidden ? null : lead.notes,
    notesHidden,
    status: lead.status,
    source: lead.source,
    leadPhase: lead.leadPhase || "active",
    leadProgressTags: lead.leadProgressTags || [],
    verifiedAt: lead.verifiedAt || null,
    processedAt: lead.processedAt || null,
    saleDoneAt: lead.saleDoneAt || null,
    leadProcessedRequired: Boolean(lead.leadProcessedRequired),
    leadContactTag: lead.leadContactTag,
    leadContactCounts: lead.leadContactCounts || {},
    leadAppointmentAt: lead.leadAppointmentAt,
    leadAppointmentNote: lead.leadAppointmentNote,
    leadPaymentMethod: lead.leadPaymentMethod,
    leadPaymentChargeStatus: paymentChargeVisible ? lead.leadPaymentChargeStatus || null : null,
    leadPaymentDeclineReason: paymentChargeVisible ? lead.leadPaymentDeclineReason || null : null,
    leadPaymentProcessor: paymentChargeVisible ? lead.leadPaymentProcessor || null : null,
    leadPaymentChargeAmount:
      lead.leadPaymentChargeAmount != null ? Number(lead.leadPaymentChargeAmount) : null,
    leadCancelReason: lead.leadCancelReason,
    nextCallbackAt: lead.nextCallbackAt,
    assignedUserId: lead.assignedUserId,
    assignedUsername: lead.assignedUser?.username ?? null,
    assignedUserRole: lead.assignedUser?.role ?? null,
    supervisorUsername: lead.assignedUser?.supervisor?.username ?? null,
    processorUserId: lead.processorUserId,
    processorUsername: lead.processorUser?.username ?? null,
    createdByUserId: lead.createdByUserId,
    createdByUsername: lead.createdBy?.username ?? null,
    createdByUserRole: lead.createdBy?.role ?? null,
    createdFromCallLogId: lead.createdFromCallLogId,
    // Linked customer / payment method ids are visible to anyone who can open the lead.
    // Charge outcome fields above stay admin-only.
    customerId: lead.customerId ?? null,
    customerPaymentMethodId: lead.customerPaymentMethodId ?? null,
    importOwnerUserId: lead.importOwnerUserId ?? null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastCallAt,
  };
}
