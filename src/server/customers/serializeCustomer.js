import { formatLeadService } from "@/lib/leadService";
import {
  getLeadPaymentMethodMeta,
  parsePaymentMethodIdFromActivityBody,
  stripPaymentMethodIdFromActivityBody,
} from "@/lib/leadWorkflow";
import { serializeChargeablePaymentMethod } from "@/server/customers/serializeChargeablePaymentMethod";

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

export function serializeCustomerLead(lead, extras = {}) {
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
    leadProgressTags: Array.isArray(lead.leadProgressTags) ? lead.leadProgressTags : [],
    verifiedAt: lead.verifiedAt || null,
    processedAt: lead.processedAt || null,
    saleDoneAt: lead.saleDoneAt || null,
    leadPaymentMethod: lead.leadPaymentMethod || null,
    customerPaymentMethodId: lead.customerPaymentMethodId ?? null,
    leadPaymentChargeStatus: lead.leadPaymentChargeStatus || null,
    leadPaymentDeclineReason: lead.leadPaymentDeclineReason || null,
    leadPaymentProcessor: lead.leadPaymentProcessor || null,
    paymentChargeLogGroups: Array.isArray(extras.paymentChargeLogGroups)
      ? extras.paymentChargeLogGroups
      : [],
    createdByUsername: lead.createdBy?.username ?? null,
    assignedUsername: lead.assignedUser?.username ?? null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

export function serializePaymentChargeLog(row) {
  const rawBody = row.body || "";
  return {
    id: row.id,
    body: stripPaymentMethodIdFromActivityBody(rawBody),
    customerPaymentMethodId: parsePaymentMethodIdFromActivityBody(rawBody),
    username: row.author?.username || null,
    createdAt: row.createdAt,
  };
}

function paymentMethodGroupLabel(pm) {
  if (!pm) return "Unknown card";
  const type = getLeadPaymentMethodMeta(pm.type).label;
  const summary = serializeChargeablePaymentMethod(pm).summary;
  return summary ? `${type} · ${summary}` : type;
}

/** Group payment charge/link logs by card; highlight current + charged. */
export function buildPaymentChargeLogGroups(logs, paymentMethods, lead) {
  const pmById = new Map((paymentMethods || []).map((pm) => [pm.id, pm]));
  const currentPmId = lead?.customerPaymentMethodId ?? null;
  const chargedPmId =
    lead?.leadPaymentChargeStatus === "charged" && currentPmId != null ? currentPmId : null;

  const groupsMap = new Map();
  for (const log of logs || []) {
    const key = log.customerPaymentMethodId == null ? "unknown" : String(log.customerPaymentMethodId);
    if (!groupsMap.has(key)) {
      const pmId = log.customerPaymentMethodId;
      const pm = pmId != null ? pmById.get(pmId) : null;
      groupsMap.set(key, {
        customerPaymentMethodId: pmId,
        label: paymentMethodGroupLabel(pm),
        isCurrent: pmId != null && pmId === currentPmId,
        isCharged: pmId != null && pmId === chargedPmId,
        logs: [],
      });
    }
    groupsMap.get(key).logs.push(log);
  }

  // Ensure current linked card appears even with no logs yet.
  if (currentPmId != null && !groupsMap.has(String(currentPmId))) {
    const pm = pmById.get(currentPmId);
    groupsMap.set(String(currentPmId), {
      customerPaymentMethodId: currentPmId,
      label: paymentMethodGroupLabel(pm),
      isCurrent: true,
      isCharged: chargedPmId === currentPmId,
      logs: [],
    });
  }

  return [...groupsMap.values()].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.isCharged !== b.isCharged) return a.isCharged ? -1 : 1;
    const aTime = a.logs[0]?.createdAt ? new Date(a.logs[0].createdAt).getTime() : 0;
    const bTime = b.logs[0]?.createdAt ? new Date(b.logs[0].createdAt).getTime() : 0;
    return bTime - aTime;
  });
}
