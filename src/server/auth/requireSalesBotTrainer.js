import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canTrainSalesBot } from "@/server/auth/canTrainSalesBot";

export async function requireSalesBotTrainer() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return { authedUser: null, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (authedUser.accessMode === "limited" || !canTrainSalesBot(authedUser)) {
    return { authedUser, errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { authedUser, errorResponse: null };
}
