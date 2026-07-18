import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { getLiveShiftStatus } from "@/server/auth/shiftSettings";

export const runtime = "nodejs";

/** Shift status for badges/banners. Authenticated non-admins get their assigned shift. */
export async function GET() {
  const user = await getAuthedUser();
  const shiftStatus = await getLiveShiftStatus(user);

  return NextResponse.json({
    status: shiftStatus.status,
    label: shiftStatus.label,
    detail: shiftStatus.detail,
    windowLabel: shiftStatus.windowLabel,
    active: shiftStatus.active,
    endingSoon: shiftStatus.endingSoon,
    minutesRemaining: shiftStatus.minutesRemaining,
    shiftEndLabel: shiftStatus.shiftEndLabel,
    timezoneLabel: shiftStatus.timezoneLabel,
    warningMinutes: shiftStatus.warningMinutes,
    shiftKey: shiftStatus.shiftKey,
    shiftName: shiftStatus.shiftName,
    shifts: shiftStatus.shifts,
  });
}
