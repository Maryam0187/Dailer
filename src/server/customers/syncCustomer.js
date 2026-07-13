import db from "@/server/db";

function trimOrNull(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

/** Build customer profile fields from a lead-like object. */
export function customerProfileFromLeadFields(fields) {
  const serviceType = fields.serviceType || null;
  return {
    fullName: trimOrNull(fields.fullName, 128),
    city: trimOrNull(fields.city, 128),
    state: trimOrNull(fields.state, 32),
    zipCode: trimOrNull(fields.zipCode, 16),
    serviceType,
    cableName: serviceType === "cable" ? trimOrNull(fields.cableName, 128) : null,
    streamName: serviceType === "streams" ? trimOrNull(fields.streamName, 128) : null,
  };
}

/**
 * Find or create a customer by phone and refresh profile from the latest lead fields.
 * Does not throw away existing customers — safe to call on every lead create/update.
 */
export async function findOrCreateCustomerForLead(phone, leadFields, { transaction } = {}) {
  if (!phone) return null;

  const profile = customerProfileFromLeadFields(leadFields || {});
  // Don't wipe an existing name if this update has no fullName
  const updatePayload = { ...profile };
  if (updatePayload.fullName == null) {
    delete updatePayload.fullName;
  }

  let customer = await db.Customer.findOne({
    where: { phone },
    transaction,
  });

  if (!customer) {
    customer = await db.Customer.create(
      {
        phone,
        ...profile,
      },
      { transaction },
    );
    return customer;
  }

  await customer.update(updatePayload, { transaction });
  return customer;
}

/** Sync customerId + profile after lead fields change. Returns customer id or null. */
export async function syncLeadCustomer(lead, changedFields = {}, { transaction } = {}) {
  const phone = changedFields.phone !== undefined ? changedFields.phone : lead.phone;
  if (!phone) return lead.customerId ?? null;

  const merged = {
    fullName: changedFields.fullName !== undefined ? changedFields.fullName : lead.fullName,
    city: changedFields.city !== undefined ? changedFields.city : lead.city,
    state: changedFields.state !== undefined ? changedFields.state : lead.state,
    zipCode: changedFields.zipCode !== undefined ? changedFields.zipCode : lead.zipCode,
    serviceType:
      changedFields.serviceType !== undefined ? changedFields.serviceType : lead.serviceType,
    cableName: changedFields.cableName !== undefined ? changedFields.cableName : lead.cableName,
    streamName: changedFields.streamName !== undefined ? changedFields.streamName : lead.streamName,
  };

  const customer = await findOrCreateCustomerForLead(phone, merged, { transaction });
  return customer?.id ?? null;
}
