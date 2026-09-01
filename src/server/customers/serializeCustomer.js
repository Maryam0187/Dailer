import { formatLeadService } from "@/lib/leadService";
import {
  getLeadPaymentMethodMeta,
  parsePaymentMethodIdFromActivityBody,
  paymentOneTimeOutcomeFlags,
  stripPaymentActivityMetaTags,
  stripPaymentMethodIdFromActivityBody,
} from "@/lib/leadWorkflow";
import { serializeChargeablePaymentMethod } from "@/server/customers/serializeChargeablePaymentMethod";

export const PAYMENT_METHOD_TYPES = ["card", "e_check", "check_mail", "pos_link"];

export const customerManagerInclude = {
  association: "manager",
  attributes: ["id", "username"],
  required: false,
};

export const customerAgentInclude = {
  association: "agent",
  attributes: ["id", "username"],
  required: false,
};

export const leadManagerInclude = {
  association: "manager",
  attributes: ["id", "username"],
  required: false,
};

export const leadAgentInclude = {
  association: "agent",
  attributes: ["id", "username"],
  required: false,
};

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
    email: row.email,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdByUsername: row.createdBy?.username ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeCustomerCharge(row) {
  if (!row) return null;
  const amount = row.amount != null ? Number(row.amount) : null;
  return {
    id: row.id,
    customerId: row.customerId,
    leadId: row.leadId ?? null,
    customerPaymentMethodId: row.customerPaymentMethodId ?? null,
    status: row.status,
    amount: Number.isFinite(amount) ? amount : null,
    processor: row.processor || null,
    cardLast4: row.cardLast4 || null,
    cardBrand: row.cardBrand || null,
    authCode: row.authCode || null,
    arn: row.arn || null,
    processorTransactionId: row.processorTransactionId || null,
    declineReason: row.declineReason || null,
    createdByUserId: row.createdByUserId ?? null,
    createdByUsername: row.createdBy?.username ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeCustomer(customer, extras = {}) {
  const latestLead = extras.latestLead || null;
  const latestSale = extras.latestSale || null;
  const storedName = customer.fullName?.trim() || null;
  const latestCharge = extras.latestCharge || null;
  const saleForDisplay = latestSale || null;
  return {
    id: customer.id,
    phone: customer.phone,
    cellNumber: customer.cellNumber || null,
    accountNumber: customer.accountNumber || null,
    chargeAmount: (() => {
      const stored = customer.chargeAmount != null ? Number(customer.chargeAmount) : null;
      if (Number.isFinite(stored)) return stored;
      const fromLatest = latestCharge?.amount != null ? Number(latestCharge.amount) : null;
      return Number.isFinite(fromLatest) ? fromLatest : null;
    })(),
    fullName: storedName,
    address: customer.address || null,
    city: customer.city,
    state: customer.state,
    zipCode: customer.zipCode,
    notes: customer.notes || null,
    managerId: customer.managerId ?? null,
    managerUsername: extras.managerUsername ?? customer.manager?.username ?? null,
    agentId: customer.agentId ?? null,
    agentUsername: extras.agentUsername ?? customer.agent?.username ?? null,
    serviceType: customer.serviceType,
    cableName: customer.cableName,
    streamName: customer.streamName,
    serviceLabel: formatLeadService(customer),
    displayName: storedName || latestLead?.fullName?.trim() || null,
    isOutside: Boolean(customer.isOutside),
    leadCount: extras.leadCount ?? null,
    salesCount: extras.salesCount ?? null,
    firstLeadAt: extras.firstLeadAt ?? null,
    lastLeadAt: extras.lastLeadAt ?? null,
    firstSaleAt: extras.firstSaleAt ?? null,
    lastSaleAt: extras.lastSaleAt ?? null,
    paymentMethodCount: extras.paymentMethodCount ?? null,
    latestCharge: latestCharge ? serializeCustomerCharge(latestCharge) : null,
    latestSale: saleForDisplay
      ? {
          id: saleForDisplay.id,
          leadPaymentChargeStatus: saleForDisplay.leadPaymentChargeStatus || null,
          leadPaymentChargeAmount:
            saleForDisplay.leadPaymentChargeAmount != null
              ? Number(saleForDisplay.leadPaymentChargeAmount)
              : null,
          leadPaymentOutcomeAt: saleForDisplay.leadPaymentOutcomeAt || null,
        }
      : null,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export function serializeCustomerLead(lead, extras = {}) {
  const paymentLogs = Array.isArray(extras.paymentChargeLogs) ? extras.paymentChargeLogs : [];
  const outcomeFlags =
    extras.paymentOutcomeFlags ||
    paymentOneTimeOutcomeFlags(paymentLogs);
  return {
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    city: lead.city,
    state: lead.state,
    zipCode: lead.zipCode,
    serviceType: lead.serviceType,
    cableName: lead.cableName || null,
    streamName: lead.streamName || null,
    serviceLabel: formatLeadService(lead),
    accountNumber: lead.accountNumber || null,
    notes: lead.notes || null,
    breakdown: lead.breakdown || null,
    managerId: lead.managerId ?? null,
    managerUsername: lead.manager?.username ?? null,
    agentId: lead.agentId ?? null,
    agentUsername: lead.agent?.username ?? null,
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
    leadPaymentChargeAmount:
      lead.leadPaymentChargeAmount != null ? Number(lead.leadPaymentChargeAmount) : null,
    leadPaymentOutcomeAt: lead.leadPaymentOutcomeAt || null,
    source: lead.source || null,
    paymentChargeLogGroups: Array.isArray(extras.paymentChargeLogGroups)
      ? extras.paymentChargeLogGroups
      : [],
    hasPaymentCharged: Boolean(outcomeFlags.hasCharged),
    hasPaymentChargeback: Boolean(outcomeFlags.hasChargeback),
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
    type: row.type || null,
    body: stripPaymentActivityMetaTags(rawBody) || stripPaymentMethodIdFromActivityBody(rawBody),
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

/** Sale-level logs (e.g. charge amount) are not tied to a payment method. */
function paymentLogGroupLabel(pmId, pm) {
  if (pmId == null) return "Sale";
  return paymentMethodGroupLabel(pm);
}

/** Group payment charge/link logs by card; sale-level amount logs stay under Sale. */
export function buildPaymentChargeLogGroups(logs, paymentMethods, lead) {
  const pmById = new Map((paymentMethods || []).map((pm) => [pm.id, pm]));
  const currentPmId = lead?.customerPaymentMethodId ?? null;
  const chargedPmId =
    lead?.leadPaymentChargeStatus === "charged" && currentPmId != null ? currentPmId : null;

  const groupsMap = new Map();
  for (const log of logs || []) {
    const key = log.customerPaymentMethodId == null ? "sale" : String(log.customerPaymentMethodId);
    if (!groupsMap.has(key)) {
      const pmId = log.customerPaymentMethodId;
      const pm = pmId != null ? pmById.get(pmId) : null;
      groupsMap.set(key, {
        customerPaymentMethodId: pmId,
        label: paymentLogGroupLabel(pmId, pm),
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
      label: paymentLogGroupLabel(currentPmId, pm),
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
