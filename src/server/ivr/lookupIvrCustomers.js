import { Op } from "sequelize";
import db from "@/server/db";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

function phoneVariants(raw) {
  const input = String(raw || "").trim();
  if (!input) return [];

  const e164 = normalizeToE164(input);
  const digits = input.replace(/\D/g, "");
  const variants = new Set();

  if (e164) {
    variants.add(e164);
    variants.add(e164.replace(/^\+/, ""));
  }
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
    if (digits.length >= 7 && digits.length <= 15) {
      variants.add(`+${digits}`);
    }
  }

  return [...variants].filter(Boolean);
}

function serializeCustomerMatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone || null,
    fullName: row.fullName || null,
  };
}

function serializeLastSale(lead) {
  if (!lead?.id) return null;
  return {
    id: lead.id,
    fullName: lead.fullName || null,
    phone: lead.phone || null,
    status: lead.status || null,
    createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString() : null,
  };
}

async function findCustomerByExactPhoneVariants(variants) {
  if (!variants.length) return null;
  return db.Customer.findOne({
    where: { phone: { [Op.in]: variants } },
    attributes: ["id", "phone", "fullName"],
    order: [["id", "ASC"]],
  });
}

async function findCustomerByPhoneSuffix(digits) {
  if (!digits || digits.length < 4) return null;
  const tails = [...new Set([digits, digits.slice(-10), digits.slice(-7)].filter((t) => t.length >= 4))];
  for (const tail of tails) {
    const row = await db.Customer.findOne({
      where: { phone: { [Op.like]: `%${tail}` } },
      attributes: ["id", "phone", "fullName"],
      order: [["id", "ASC"]],
    });
    if (row) return row;
  }
  return null;
}

async function findCustomerViaLeadPhone(variants, digits) {
  const or = [];
  if (variants.length) or.push({ phone: { [Op.in]: variants } });
  if (digits && digits.length >= 4) {
    or.push({ phone: { [Op.like]: `%${digits.slice(-10)}` } });
  }
  if (!or.length) return null;

  const lead = await db.Lead.findOne({
    where: { [Op.or]: or },
    attributes: ["id", "customerId", "phone"],
    include: [
      {
        model: db.Customer,
        as: "customer",
        attributes: ["id", "phone", "fullName"],
        required: true,
      },
    ],
    order: [["id", "DESC"]],
  });
  return lead?.customer || null;
}

async function withLastSale(customer) {
  if (!customer?.id) return customer;
  try {
    const lead = await db.Lead.findOne({
      where: { customerId: customer.id },
      order: [["createdAt", "DESC"]],
      attributes: ["id", "fullName", "phone", "status", "createdAt"],
    });
    return { ...customer, lastSale: serializeLastSale(lead) };
  } catch (err) {
    console.warn("[ivr/lookupIvrCustomers] lastSale", err?.message || err);
    return { ...customer, lastSale: null };
  }
}

/**
 * Match a Customer by phone / associate digits (Customer.phone, then Lead.phone).
 */
export async function findCustomerByPhoneOrNumber(raw) {
  const input = String(raw || "").trim();
  if (!input) return null;

  const variants = phoneVariants(input);
  const digits = input.replace(/\D/g, "");
  if (!variants.length && digits.length < 4) return null;

  try {
    const exact = await findCustomerByExactPhoneVariants(variants);
    if (exact) return withLastSale(serializeCustomerMatch(exact));

    const suffix = await findCustomerByPhoneSuffix(digits);
    if (suffix) return withLastSale(serializeCustomerMatch(suffix));

    const viaLead = await findCustomerViaLeadPhone(variants, digits);
    if (viaLead) return withLastSale(serializeCustomerMatch(viaLead));
  } catch (err) {
    console.warn("[ivr/lookupIvrCustomers]", err?.message || err);
  }

  return null;
}

/**
 * Caller From → customer.
 * Entered associate number (IVR gather step=number) → associateCustomer.
 * Each match includes lastSale (latest lead) when present.
 */
export async function lookupIvrCustomers({ from, number } = {}) {
  const associateNumber = String(number || "").trim();
  const [customer, associateCustomer] = await Promise.all([
    findCustomerByPhoneOrNumber(from),
    associateNumber ? findCustomerByPhoneOrNumber(associateNumber) : Promise.resolve(null),
  ]);
  return { customer, associateCustomer };
}
