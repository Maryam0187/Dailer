import { createOutsideLead } from "@/server/customers/createOutsideLead";

/**
 * Create a per-sale lead row for an outside customer (shared payment methods on customer).
 * @param {object} customer
 * @param {{ id: number }} authedUser
 * @param {object} [body]
 */
export async function createOutsideSaleLead(customer, authedUser, body = null) {
  const { lead } = await createOutsideLead(authedUser, body || {}, { customer });
  return lead;
}
