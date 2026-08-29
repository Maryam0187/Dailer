import db from "@/server/db";
import { getStateByCode } from "@/lib/usStates";
import { OUTSIDE_SALE_SOURCE } from "@/lib/outsideSale";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { isOutsideManager } from "@/server/customers/customerAccess";
import {
  findCustomerByPhone,
  trimCustomerField,
  resolveCustomerStaffIds,
} from "@/server/customers/parseCustomerBody";
import {
  parseOutsideSaleBody,
  validateOutsideSaleStaff,
} from "@/server/customers/parseOutsideSaleBody";
import { createLeadUpdate } from "@/server/leads/leadUpdates";

function customerTouchFromLeadBody(body, fullName) {
  const serviceType = body.serviceType || null;
  return {
    fullName: fullName || null,
    cellNumber: body.cellNumber || null,
    city: body.city || null,
    state: body.state || null,
    zipCode: body.zipCode || null,
    serviceType,
    cableName: serviceType === "cable" ? body.cableName || null : null,
    streamName: serviceType === "streams" ? body.streamName || null : null,
    accountNumber: body.accountNumber || null,
    notes: body.notes || null,
  };
}

function fillEmptyCustomerFields(target, source, keys) {
  for (const key of keys) {
    if (source[key] === undefined || source[key] === null) continue;
    const current = target[key];
    if (current == null || String(current).trim() === "") {
      target[key] = source[key];
    }
  }
}

async function resolveOutsideCustomer(authedUser, { phone, fullName, profile, staff }) {
  const existing = await findCustomerByPhone(phone);
  const fillKeys = [
    "fullName",
    "cellNumber",
    "city",
    "state",
    "zipCode",
    "serviceType",
    "cableName",
    "streamName",
    "accountNumber",
    "notes",
  ];

  if (existing) {
    if (existing.isOutside) {
      if (isOutsideManager(authedUser) && Number(existing.managerId) !== Number(authedUser.id)) {
        const err = new Error("An outside customer with this phone already exists");
        err.statusCode = 409;
        throw err;
      }
      const touch = { updatedAt: new Date() };
      fillEmptyCustomerFields(touch, profile, fillKeys);
      if (!isOutsideManager(authedUser)) {
        touch.managerId = staff.manager?.id ?? profile.managerId ?? existing.managerId;
        touch.agentId = staff.agent?.id ?? profile.agentId ?? existing.agentId ?? null;
      }
      await existing.update(touch);
      return existing;
    }

    if (isOutsideManager(authedUser)) {
      const promote = {
        isOutside: true,
        managerId: authedUser.id,
        agentId: staff.agent?.id ?? profile.agentId ?? null,
        updatedAt: new Date(),
      };
      fillEmptyCustomerFields(promote, profile, fillKeys);
      await existing.update(promote);
      return existing;
    }

    const promote = {
      isOutside: true,
      managerId: staff.manager?.id ?? profile.managerId,
      agentId: staff.agent?.id ?? profile.agentId ?? null,
      updatedAt: new Date(),
    };
    fillEmptyCustomerFields(promote, profile, fillKeys);
    await existing.update(promote);
    return existing;
  }

  return db.Customer.create({
    phone,
    isOutside: true,
    managerId: staff.manager?.id ?? profile.managerId,
    agentId: staff.agent?.id ?? profile.agentId ?? null,
    ...profile,
    fullName: fullName || profile.fullName || "Customer",
  });
}

/**
 * Create an outside_sale lead. Finds or creates the outside customer by phone when
 * `customer` is not passed (lead-first flow on the Outside tab).
 *
 * @param {object} authedUser
 * @param {object} body
 * @param {{ customer?: object }} [options]
 */
export async function createOutsideLead(authedUser, body, { customer: knownCustomer = null } = {}) {
  const src = body && typeof body === "object" ? body : {};

  const phone = knownCustomer?.phone || normalizeToE164(src.phone);
  const fullName =
    trimCustomerField(knownCustomer?.fullName || knownCustomer?.displayName || src.fullName, 128) ||
    trimCustomerField(src.fullName, 128);
  const cellRaw = trimCustomerField(
    knownCustomer?.cellNumber != null ? knownCustomer.cellNumber : src.cellNumber,
    32,
  );
  const cellNumber = cellRaw ? normalizeToE164(cellRaw) : null;

  if (!phone) {
    const err = new Error("Valid phone is required");
    err.statusCode = 400;
    throw err;
  }
  if (!fullName) {
    const err = new Error("Full name is required");
    err.statusCode = 400;
    throw err;
  }
  if (cellRaw && !cellNumber) {
    const err = new Error("Valid cell number is required");
    err.statusCode = 400;
    throw err;
  }

  const stateRaw = trimCustomerField(knownCustomer?.state ?? src.state, 32);
  let state = null;
  if (stateRaw) {
    const resolved = getStateByCode(stateRaw);
    if (!resolved) {
      const err = new Error("Invalid state");
      err.statusCode = 400;
      throw err;
    }
    state = resolved.code;
  }

  const { data: saleData, errors } = parseOutsideSaleBody(src, {});
  if (errors.length) {
    const err = new Error(errors[0]);
    err.statusCode = 400;
    throw err;
  }

  if (isOutsideManager(authedUser)) {
    saleData.managerId = authedUser.id;
  }

  const staff = await validateOutsideSaleStaff(saleData, { requireManager: true });
  if (staff.error) {
    const err = new Error(staff.error);
    err.statusCode = 400;
    throw err;
  }

  const profile = customerTouchFromLeadBody(
    {
      ...saleData,
      cellNumber,
      city: trimCustomerField(knownCustomer?.city ?? src.city, 128),
      state,
      zipCode: trimCustomerField(knownCustomer?.zipCode ?? src.zipCode, 16),
    },
    fullName,
  );
  profile.managerId = staff.manager?.id ?? saleData.managerId;
  profile.agentId = staff.agent?.id ?? saleData.agentId ?? null;

  const customer =
    knownCustomer ||
    (await resolveOutsideCustomer(authedUser, { phone, fullName, profile, staff }));

  const lead = await db.Lead.create({
    phone: customer.phone,
    fullName,
    cellNumber,
    city: profile.city,
    state: profile.state,
    zipCode: profile.zipCode,
    serviceType: saleData.serviceType ?? null,
    cableName: saleData.cableName ?? null,
    streamName: saleData.streamName ?? null,
    accountNumber: saleData.accountNumber ?? null,
    breakdown: saleData.breakdown ?? null,
    notes: saleData.notes ?? null,
    managerId: staff.manager?.id ?? saleData.managerId ?? customer.managerId ?? null,
    agentId: staff.agent?.id ?? saleData.agentId ?? customer.agentId ?? null,
    leadPaymentChargeAmount: saleData.leadPaymentChargeAmount ?? null,
    status: "closed",
    source: OUTSIDE_SALE_SOURCE,
    leadPhase: "active",
    customerId: customer.id,
    createdByUserId: authedUser.id,
  });

  await db.Customer.update({ updatedAt: new Date() }, { where: { id: customer.id } });

  await createLeadUpdate({
    leadId: lead.id,
    userId: authedUser.id,
    type: "created",
    body: "Outside lead created",
  });

  return { customer, lead };
}
