import { NextResponse } from "next/server";
import { denyUnlessFullAccess } from "@/server/auth/accessMode";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export { denyUnlessFullAccess } from "@/server/auth/accessMode";

export async function getAuthedUserRequiringFullAccess() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return {
      authedUser: null,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const check = denyUnlessFullAccess(authedUser);
  if (!check.ok) {
    return {
      authedUser: null,
      errorResponse: NextResponse.json({ error: check.error }, { status: check.status }),
    };
  }

  return { authedUser, errorResponse: null };
}
