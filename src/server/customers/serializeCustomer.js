import { formatLeadService } from "@/lib/leadService";

export const PAYMENT_METHOD_TYPES = ["card", "e_check", "check_mail", "pos_link"];

export function serializePaymentMethod(row) {
  return {
    id: row.id,
    customerId: row.customerId,
    type: row.type,
    isDefault: Boolean(row.isDefault),
    nameOnCard: row.nameOnCard,
    cardType: row.cardType,
    brand: row.brand,
    cardNumber: row.cardNumber,
    expDate: row.expDate,
    cvv: row.cvv,
    routingNumber: row.routingNumber,
    accountNumber: row.accountNumber,
    checkNumber: row.checkNumber,
    bankName: row.bankName,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdByUsername: row.createdBy?.username ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeCustomer(customer, extras = {}) {
  const latestLead = extras.latestLead || null;
  const storedName = customer.fullName?.trim() || null;
  return {
    id: customer.id,
    phone: customer.phone,
    fullName: storedName,
    city: customer.city,
    state: customer.state,
    zipCode: customer.zipCode,
    serviceType: customer.serviceType,
    cableName: customer.cableName,
    streamName: customer.streamName,
    serviceLabel: formatLeadService(customer),
    displayName: storedName || latestLead?.fullName?.trim() || null,
    leadCount: extras.leadCount ?? null,
    firstLeadAt: extras.firstLeadAt ?? null,
    lastLeadAt: extras.lastLeadAt ?? null,
    paymentMethodCount: extras.paymentMethodCount ?? null,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export function serializeCustomerLead(lead) {
  return {
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    city: lead.city,
    state: lead.state,
    zipCode: lead.zipCode,
    serviceType: lead.serviceType,
    serviceLabel: formatLeadService(lead),
    status: lead.status,
    leadPhase: lead.leadPhase || "active",
    leadPaymentMethod: lead.leadPaymentMethod || null,
    customerPaymentMethodId: lead.customerPaymentMethodId ?? null,
    createdByUsername: lead.createdBy?.username ?? null,
    assignedUsername: lead.assignedUser?.username ?? null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}
