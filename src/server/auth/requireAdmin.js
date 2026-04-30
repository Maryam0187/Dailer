import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export async function requireAdmin() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return { authedUser: null, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (authedUser.role !== "admin") {
    return { authedUser: null, errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { authedUser, errorResponse: null };
}
