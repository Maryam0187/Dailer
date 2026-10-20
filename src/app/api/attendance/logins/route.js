import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  assertCanManageTarget,
  canAccessAttendance,
} from "@/server/auth/userAccess";
import {
  loadDayLoginsForUser,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAttendance(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const target = await db.User.findByPk(userId, {
    attributes: ["id", "role", "managerId", "supervisorId", "isOutside", "shiftKey", "isActive"],
  });
  if (!target || target.isActive === false) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!assertCanManageTarget(authedUser, target)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const logins = await loadDayLoginsForUser(userId, calendarDate);
  return NextResponse.json({ date: calendarDate, userId, logins });
}
