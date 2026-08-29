import { NextResponse } from "next/server";
import db from "@/server/db";
import { denyUnlessFullAccess } from "@/server/auth/accessMode";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { isOutsideSaleSource } from "@/lib/outsideSale";

export function isOutsideManager(user) {
  return user?.role === "manager" && Boolean(user.isOutside);
}

export function canAccessCustomers(user) {
  return user?.role === "admin" || isOutsideManager(user);
}

export async function requireCustomerAccess() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return {
      authedUser: null,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const access = denyUnlessFullAccess(authedUser);
  if (!access.ok) {
    return {
      authedUser: null,
      errorResponse: NextResponse.json({ error: access.error }, { status: access.status }),
    };
  }
  if (!canAccessCustomers(authedUser)) {
    return {
      authedUser: null,
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { authedUser, errorResponse: null };
}

export async function findAccessibleCustomer(authedUser, customerId, options = {}) {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const where = { ...(options.where || {}), id };
  if (isOutsideManager(authedUser)) {
    where.isOutside = true;
    where.managerId = authedUser.id;
  }
  const { where: _ignored, ...rest } = options;
  return db.Customer.findOne({ ...rest, where });
}

/**
 * Admin may patch any customer lead. Outside managers may patch outside_sale leads on their customers.
 * @param {object} authedUser
 * @param {number} customerId
 * @param {object} lead
 * @param {{ clearingCharge?: boolean }} opts
 */
export async function assertCustomerLeadPatchAccess(
  authedUser,
  customerId,
  lead,
  { clearingCharge = false } = {},
) {
  const customer = await findAccessibleCustomer(authedUser, customerId);
  if (!customer) {
    return {
      ok: false,
      errorResponse: NextResponse.json({ error: "Customer not found" }, { status: 404 }),
    };
  }

  if (authedUser.role === "admin") {
    return { ok: true, customer, errorResponse: null };
  }

  if (isOutsideManager(authedUser)) {
    if (!customer.isOutside) {
      return {
        ok: false,
        errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    if (!isOutsideSaleSource(lead.source)) {
      return {
        ok: false,
        errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    if (clearingCharge) {
      return {
        ok: false,
        errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, customer, errorResponse: null };
  }

  return {
    ok: false,
    errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
}
