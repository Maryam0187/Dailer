import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  loadDayLoginsForUser,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const calendarDate = parseAttendanceDateOnly(searchParams.get("date"));
  const rawUserId = searchParams.get("userId");
  const userId = rawUserId ? Number(rawUserId) : null;

  if (!calendarDate) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const logins = await loadDayLoginsForUser(userId, calendarDate);
  return NextResponse.json({ date: calendarDate, userId, logins });
}
