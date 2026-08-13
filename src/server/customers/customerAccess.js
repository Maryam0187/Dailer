import { NextResponse } from "next/server";
import db from "@/server/db";
import { denyUnlessFullAccess } from "@/server/auth/accessMode";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

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
