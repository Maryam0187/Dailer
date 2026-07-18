import { NextResponse } from "next/server";
import { getAllShiftStatuses, getShiftStatus } from "@/server/auth/loginWindow";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  getShiftSettingsRecords,
  updateShiftManuallyActive,
} from "@/server/auth/shiftSettings";

export const runtime = "nodejs";

/** Admin toggle: end shift immediately or activate it again (per day/night). */
export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  if (body?.manuallyActive === undefined) {
    return NextResponse.json({ error: "manuallyActive is required" }, { status: 400 });
  }

  const shiftKey = body?.shiftKey === "night" ? "night" : "day";
  await updateShiftManuallyActive(body.manuallyActive, authedUser.id, shiftKey);

  const shifts = await getShiftSettingsRecords();
  const shiftStatuses = getAllShiftStatuses();

  return NextResponse.json({
    ok: true,
    shifts,
    settings: shifts[shiftKey],
    shiftStatus: getShiftStatus(new Date(), shiftKey),
    shiftStatuses,
  });
}
