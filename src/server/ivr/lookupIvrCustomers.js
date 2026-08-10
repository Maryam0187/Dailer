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

/**
 * Match a Customer by phone / associate digits (exact variants, then ending digits).
 */
export async function findCustomerByPhoneOrNumber(raw) {
  const variants = phoneVariants(raw);
  const digits = String(raw || "").replace(/\D/g, "");
  if (!variants.length && digits.length < 4) return null;

  try {
    if (variants.length) {
      const exact = await db.Customer.findOne({
        where: { phone: { [Op.in]: variants } },
        attributes: ["id", "phone", "fullName"],
        order: [["id", "ASC"]],
      });
      if (exact) return serializeCustomerMatch(exact);
    }

    // Associate numbers may be a partial phone / account-style digit string.
    if (digits.length >= 7) {
      const tail = digits.slice(-10);
      const fuzzy = await db.Customer.findOne({
        where: { phone: { [Op.like]: `%${tail}` } },
        attributes: ["id", "phone", "fullName"],
        order: [["id", "ASC"]],
      });
      if (fuzzy) return serializeCustomerMatch(fuzzy);
    }
  } catch (err) {
    console.warn("[ivr/lookupIvrCustomers]", err?.message || err);
  }

  return null;
}

/** Caller From + optional associate number entered in IVR. */
export async function lookupIvrCustomers({ from, number } = {}) {
  const [customer, associateCustomer] = await Promise.all([
    findCustomerByPhoneOrNumber(from),
    number ? findCustomerByPhoneOrNumber(number) : Promise.resolve(null),
  ]);
  return { customer, associateCustomer };
}
