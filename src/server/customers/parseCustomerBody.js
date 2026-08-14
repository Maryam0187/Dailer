import { Op } from "sequelize";
import { getStateByCode } from "@/lib/usStates";
import { SERVICE_TYPE_OPTIONS } from "@/lib/leadService";
import { normalizeLeadPaymentChargeAmount } from "@/lib/leadWorkflow";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import db from "@/server/db";

const CUSTOMER_SERVICE_TYPES = new Set(SERVICE_TYPE_OPTIONS.map((o) => o.value));

export function trimCustomerField(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function phoneLookupVariants(phone) {
  const variants = new Set();
  const input = String(phone || "").trim();
  if (input) variants.add(input);
  const e164 = normalizeToE164(input);
  if (e164) {
    variants.add(e164);
    variants.add(e164.replace(/^\+/, ""));
  }
  const digits = input.replace(/\D/g, "");
  if (digits) {
    variants.add(digits);
    if (digits.length === 10) {
      variants.add(`+1${digits}`);
      variants.add(`1${digits}`);
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      variants.add(`+${digits}`);
      variants.add(digits.slice(1));
    }
  }
  return [...variants].filter(Boolean);
}

export async function findCustomerByPhone(phone, { transaction } = {}) {
  const variants = phoneLookupVariants(phone);
  if (!variants.length) return null;
  return db.Customer.findOne({
    where: { phone: { [Op.in]: variants } },
    transaction,
  });
}

/**
 * Parse create/update fields for an outside customer (no lead).
 * requireName/requirePhone/requireManager apply on create.
 */
export function parseCustomerProfile(
  body,
  { requireName = false, requirePhone = false, requireManager = false } = {},
) {
  const errors = [];
  const data = {};
  const src = body && typeof body === "object" ? body : {};

  if (src.fullName !== undefined || requireName) {
    const fullName = trimCustomerField(src.fullName, 128);
    if (requireName && !fullName) errors.push("Full name is required");
    else if (src.fullName !== undefined || requireName) data.fullName = fullName;
  }

  if (src.phone !== undefined || requirePhone) {
    const phone = normalizeToE164(src.phone);
    if (!phone) errors.push("Valid phone is required");
    else data.phone = phone;
  }

  if (src.address !== undefined) data.address = trimCustomerField(src.address, 255);
  if (src.city !== undefined) data.city = trimCustomerField(src.city, 128);

  if (src.state !== undefined) {
    const raw = trimCustomerField(src.state, 32);
    if (raw) {
      const state = getStateByCode(raw);
      if (!state) errors.push("Invalid state");
      else data.state = state.code;
    } else {
      data.state = null;
    }
  }

  if (src.zipCode !== undefined) data.zipCode = trimCustomerField(src.zipCode, 16);
  if (src.notes !== undefined) data.notes = trimCustomerField(src.notes, 65535);

  if (src.cellNumber !== undefined) {
    const raw = trimCustomerField(src.cellNumber, 32);
    if (!raw) {
      data.cellNumber = null;
    } else {
      const e164 = normalizeToE164(raw);
      if (e164) {
        data.cellNumber = e164;
      } else {
        const digits = raw.replace(/\D/g, "");
        if (digits.length === 7) data.cellNumber = digits;
        else errors.push("Valid cell number is required");
      }
    }
  }

  if (src.accountNumber !== undefined) {
    const digits = String(src.accountNumber || "").replace(/\D/g, "").slice(0, 17);
    data.accountNumber = digits || null;
  }

  if (src.chargeAmount !== undefined) {
    const amount = normalizeLeadPaymentChargeAmount(src.chargeAmount);
    if (amount === undefined) errors.push("Invalid charge amount");
    else data.chargeAmount = amount;
  }

  if (src.serviceType !== undefined) {
    const raw = trimCustomerField(src.serviceType, 32);
    if (!raw) {
      data.serviceType = null;
      data.cableName = null;
      data.streamName = null;
    } else if (!CUSTOMER_SERVICE_TYPES.has(raw)) {
      errors.push("Invalid service");
    } else {
      data.serviceType = raw;
      data.cableName = raw === "cable" ? trimCustomerField(src.cableName, 128) : null;
      data.streamName = raw === "streams" ? trimCustomerField(src.streamName, 128) : null;
    }
  }

  if (src.managerId !== undefined || requireManager) {
    const parsed = parseOptionalUserId(src.managerId);
    if (parsed === undefined) errors.push("Invalid manager");
    else if (requireManager && parsed == null) errors.push("Manager is required");
    else data.managerId = parsed;
  }

  if (src.agentId !== undefined) {
    const parsed = parseOptionalUserId(src.agentId);
    if (parsed === undefined) errors.push("Invalid agent");
    else data.agentId = parsed;
  }

  return { data, errors };
}

function parseOptionalUserId(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return id;
}

/** Confirm manager/agent ids exist in Users with the expected roles. */
export async function resolveCustomerStaffIds({ managerId, agentId } = {}) {
  let manager = null;
  if (managerId != null) {
    manager = await db.User.findOne({
      where: { id: managerId, role: "manager" },
      attributes: ["id", "username", "role", "isActive", "isOutside"],
    });
    if (!manager) return { error: "Manager not found" };
    if (!manager.isOutside) return { error: "Manager must be marked as outside" };
  }

  let agent = null;
  if (agentId != null) {
    agent = await db.User.findOne({
      where: { id: agentId, role: "agent" },
      attributes: ["id", "username", "role", "isActive", "managerId", "isOutside"],
    });
    if (!agent) return { error: "Agent not found" };
    if (!agent.isOutside) return { error: "Agent must be marked as outside" };
    if (managerId != null && Number(agent.managerId) !== Number(managerId)) {
      return { error: "Agent does not report to the selected manager" };
    }
  }

  return { error: null, manager, agent };
}
