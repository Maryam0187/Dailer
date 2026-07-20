import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  getLastRevertibleImportBatch,
  revertLastImportBatch,
} from "@/server/import/runSalesImport";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const batch = await getLastRevertibleImportBatch();
  return NextResponse.json({ batch });
}

export async function POST() {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const result = await revertLastImportBatch({ adminUserId: authedUser.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }

  return NextResponse.json(result);
}
