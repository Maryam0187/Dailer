import { Op } from "sequelize";
import db from "@/server/db";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

const CUSTOMER_LOOKUP_ATTRS = ["id", "phone", "fullName", "isOutside"];
const MAX_SUFFIX_MATCHES = 8;

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
    isOutside: Boolean(row.isOutside),
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

function mergeUniqueCustomers(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      if (!row?.id || byId.has(row.id)) continue;
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ao = Boolean(a.isOutside) ? 1 : 0;
    const bo = Boolean(b.isOutside) ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return Number(a.id) - Number(b.id);
  });
}

async function findCustomersByExactPhoneVariants(variants) {
  if (!variants.length) return [];
  return db.Customer.findAll({
    where: { phone: { [Op.in]: variants } },
    attributes: CUSTOMER_LOOKUP_ATTRS,
    order: [
      ["isOutside", "ASC"],
      ["id", "ASC"],
    ],
  });
}

async function findCustomersByPhoneSuffix(digits) {
  if (!digits || digits.length < 4) return [];
  const tails = [...new Set([digits, digits.slice(-10), digits.slice(-7)].filter((t) => t.length >= 4))];
  const rows = [];
  for (const tail of tails) {
    const found = await db.Customer.findAll({
      where: { phone: { [Op.like]: `%${tail}` } },
      attributes: CUSTOMER_LOOKUP_ATTRS,
      order: [
        ["isOutside", "ASC"],
        ["id", "ASC"],
      ],
      limit: MAX_SUFFIX_MATCHES,
    });
    rows.push(...found);
    if (rows.length >= MAX_SUFFIX_MATCHES) break;
  }
  return rows;
}

async function findCustomersViaLeadPhone(variants, digits) {
  const or = [];
  if (variants.length) or.push({ phone: { [Op.in]: variants } });
  if (digits && digits.length >= 4) {
    or.push({ phone: { [Op.like]: `%${digits.slice(-10)}` } });
  }
  if (!or.length) return [];

  const leads = await db.Lead.findAll({
    where: { [Op.or]: or },
    attributes: ["id", "customerId", "phone"],
    include: [
      {
        model: db.Customer,
        as: "customer",
        attributes: CUSTOMER_LOOKUP_ATTRS,
        required: true,
      },
    ],
    order: [["id", "DESC"]],
    limit: MAX_SUFFIX_MATCHES,
  });
  return leads.map((lead) => lead.customer).filter(Boolean);
}

async function withLastSale(customer) {
  if (!customer?.id) return customer;
  if (customer.isOutside) return { ...customer, lastSale: null };
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

/** Match customers by caller phone (Customer.phone, then Lead.phone). Includes outside and lead customers. */
export async function findCustomersByPhoneOrNumber(raw) {
  const input = String(raw || "").trim();
  if (!input) return [];

  const variants = phoneVariants(input);
  const digits = input.replace(/\D/g, "");
  if (!variants.length && digits.length < 4) return [];

  try {
    const exact = await findCustomersByExactPhoneVariants(variants);
    const suffix = await findCustomersByPhoneSuffix(digits);
    const viaLead = await findCustomersViaLeadPhone(variants, digits);
    const merged = mergeUniqueCustomers([exact, suffix, viaLead]);
    return Promise.all(merged.map((row) => withLastSale(serializeCustomerMatch(row))));
  } catch (err) {
    console.warn("[ivr/lookupIvrCustomers]", err?.message || err);
    return [];
  }
}

/** @deprecated Use findCustomersByPhoneOrNumber — kept for callers that expect one row. */
export async function findCustomerByPhoneOrNumber(raw) {
  const rows = await findCustomersByPhoneOrNumber(raw);
  return rows[0] || null;
}

/** Caller From → customers (inside and outside). `customer` is the primary match. */
export async function lookupIvrCustomers({ from } = {}) {
  const customers = await findCustomersByPhoneOrNumber(from);
  return { customer: customers[0] || null, customers };
}
