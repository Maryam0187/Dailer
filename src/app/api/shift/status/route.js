import { NextResponse } from "next/server";
import { getLiveShiftStatus } from "@/server/auth/shiftSettings";

export const runtime = "nodejs";

/** Public shift status for sign-in notices and badges. */
export async function GET() {
  const shiftStatus = await getLiveShiftStatus();
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
  });
}
