import { NextResponse } from "next/server";
import { getShiftStatus } from "@/server/auth/loginWindow";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { getShiftSettingsRecord, updateShiftSettings } from "@/server/auth/shiftSettings";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const settings = await getShiftSettingsRecord();
  const shiftStatus = getShiftStatus();

  return NextResponse.json({
    settings,
    shiftStatus,
  });
}

export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);

  try {
    await updateShiftSettings(
      {
        enabled: body?.enabled !== false,
        startLocal: body?.startLocal,
        endLocal: body?.endLocal,
        startUtc: body?.startUtc,
        endUtc: body?.endUtc,
        timezone: body?.timezone,
        afterShiftGrantDurationMinutes: body?.afterShiftGrantDurationMinutes,
        leaveDays: body?.leaveDays,
      },
      authedUser.id,
    );
  } catch (err) {
    return NextResponse.json({ error: err.message || "Invalid shift settings" }, { status: 400 });
  }

  const settings = await getShiftSettingsRecord();
  const shiftStatus = getShiftStatus();

  return NextResponse.json({
    ok: true,
    settings,
    shiftStatus,
  });
}
