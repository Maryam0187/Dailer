import { SERVICE_TYPE_OPTIONS } from "@/lib/leadService";
import { normalizeLeadPaymentChargeAmount } from "@/lib/leadWorkflow";
import { trimCustomerField, resolveCustomerStaffIds } from "@/server/customers/parseCustomerBody";

const SERVICE_TYPES = new Set(SERVICE_TYPE_OPTIONS.map((o) => o.value));

function parseOptionalUserId(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return id;
}

/**
 * Parse per-sale fields (service, account, manager, agent, notes, charge amount).
 * Pass `allowedKeys` to limit which fields are read from the body.
 */
export function parseOutsideSaleBody(body, { allowedKeys = null } = {}) {
  const errors = [];
  const data = {};
  const src = body && typeof body === "object" ? body : {};

  const allow = (key) => !allowedKeys || allowedKeys.includes(key);

  if (allow("serviceType") && src.serviceType !== undefined) {
    const raw = trimCustomerField(src.serviceType, 32);
    if (!raw) {
      data.serviceType = null;
      data.cableName = null;
      data.streamName = null;
    } else if (!SERVICE_TYPES.has(raw)) {
      errors.push("Invalid service");
    } else {
      data.serviceType = raw;
      if (allow("cableName")) {
        data.cableName = raw === "cable" ? trimCustomerField(src.cableName, 128) : null;
      }
      if (allow("streamName")) {
        data.streamName = raw === "streams" ? trimCustomerField(src.streamName, 128) : null;
      }
    }
  } else {
    if (allow("cableName") && src.cableName !== undefined) {
      data.cableName = trimCustomerField(src.cableName, 128);
    }
    if (allow("streamName") && src.streamName !== undefined) {
      data.streamName = trimCustomerField(src.streamName, 128);
    }
  }

  if (allow("accountNumber") && src.accountNumber !== undefined) {
    const digits = String(src.accountNumber || "").replace(/\D/g, "").slice(0, 17);
    data.accountNumber = digits || null;
  }

  if (allow("notes") && src.notes !== undefined) {
    data.notes = trimCustomerField(src.notes, 65535);
  }

  if (allow("breakdown") && src.breakdown !== undefined) {
    data.breakdown = trimCustomerField(src.breakdown, 65535);
  }

  if (allow("managerId") && src.managerId !== undefined) {
    const parsed = parseOptionalUserId(src.managerId);
    if (parsed === undefined) errors.push("Invalid manager");
    else data.managerId = parsed;
  }

  if (allow("agentId") && src.agentId !== undefined) {
    const parsed = parseOptionalUserId(src.agentId);
    if (parsed === undefined) errors.push("Invalid agent");
    else data.agentId = parsed;
  }

  if (allow("leadPaymentChargeAmount") && src.leadPaymentChargeAmount !== undefined) {
    const amount = normalizeLeadPaymentChargeAmount(src.leadPaymentChargeAmount);
    if (amount === undefined) errors.push("Invalid charge amount");
    else data.leadPaymentChargeAmount = amount;
  }

  return { data, errors };
}

export async function validateOutsideSaleStaff(data, { requireManager = false } = {}) {
  if (requireManager && (data.managerId == null || data.managerId === "")) {
    return { error: "Manager is required" };
  }
  if (data.managerId !== undefined || data.agentId !== undefined) {
    return resolveCustomerStaffIds({
      managerId: data.managerId ?? null,
      agentId: data.agentId ?? null,
    });
  }
  return { error: null };
}

export function outsideSaleDefaultsFromCustomer(customer) {
  return {
    serviceType: customer.serviceType || "",
    cableName: customer.cableName || "",
    streamName: customer.streamName || "",
    accountNumber: customer.accountNumber || "",
    notes: "",
    breakdown: "",
    managerId: customer.managerId != null ? String(customer.managerId) : "",
    agentId: customer.agentId != null ? String(customer.agentId) : "",
    leadPaymentChargeAmount: "",
  };
}
