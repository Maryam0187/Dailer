import { NextResponse } from "next/server";
import { getAllShiftStatuses, getShiftStatus } from "@/server/auth/loginWindow";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  getShiftSettingsRecords,
  updateShiftSettings,
} from "@/server/auth/shiftSettings";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const shifts = await getShiftSettingsRecords();
  const shiftStatuses = getAllShiftStatuses();

  return NextResponse.json({
    shifts,
    settings: shifts.day,
    shiftStatus: shiftStatuses.day,
    shiftStatuses,
  });
}

export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);

  try {
    await updateShiftSettings(
      {
        shiftKey: body?.shiftKey || body?.key || "day",
        enabled: body?.enabled !== false,
        startLocal: body?.startLocal,
        endLocal: body?.endLocal,
        startUtc: body?.startUtc,
        endUtc: body?.endUtc,
        timezone: body?.timezone,
        afterShiftGrantDurationMinutes: body?.afterShiftGrantDurationMinutes,
        leaveDays: body?.leaveDays,
        name: body?.name,
      },
      authedUser.id,
    );
  } catch (err) {
    return NextResponse.json({ error: err.message || "Invalid shift settings" }, { status: 400 });
  }

  const shifts = await getShiftSettingsRecords();
  const shiftStatuses = getAllShiftStatuses();
  const key = body?.shiftKey === "night" || body?.key === "night" ? "night" : "day";

  return NextResponse.json({
    ok: true,
    shifts,
    settings: shifts[key],
    shiftStatus: getShiftStatus(new Date(), key),
    shiftStatuses,
  });
}
