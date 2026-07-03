import { NextResponse } from "next/server";
import { getShiftStatus } from "@/server/auth/loginWindow";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { getShiftSettingsRecord, updateShiftManuallyActive } from "@/server/auth/shiftSettings";

export const runtime = "nodejs";

/** Admin toggle: end shift immediately or activate it again. */
export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  if (body?.manuallyActive === undefined) {
    return NextResponse.json({ error: "manuallyActive is required" }, { status: 400 });
  }

  await updateShiftManuallyActive(body.manuallyActive, authedUser.id);

  const settings = await getShiftSettingsRecord();
  const shiftStatus = getShiftStatus();

  return NextResponse.json({
    ok: true,
    settings,
    shiftStatus,
  });
}
