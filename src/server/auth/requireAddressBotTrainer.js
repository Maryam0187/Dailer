import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canTrainAddressBot } from "@/server/auth/canTrainAddressBot";

export async function requireAddressBotTrainer() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return { authedUser: null, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (authedUser.accessMode === "limited" || !canTrainAddressBot(authedUser)) {
    return { authedUser: null, errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { authedUser, errorResponse: null };
}
