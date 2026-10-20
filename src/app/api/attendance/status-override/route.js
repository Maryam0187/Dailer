import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  assertCanManageTarget,
  canAccessAttendance,
} from "@/server/auth/userAccess";
import { parseAttendanceDateOnly } from "@/server/attendance/buildLoginAttendanceReport";
import { setAttendanceStatusOverride } from "@/server/attendance/statusOverride";

export async function PATCH(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAttendance(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = Number(body.userId);
  const calendarDate = parseAttendanceDateOnly(body.calendarDate);
  const statusOverride =
    body.statusOverride === undefined ? null : body.statusOverride;

  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!calendarDate) {
    return NextResponse.json({ error: "calendarDate is required (YYYY-MM-DD)" }, { status: 400 });
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

  try {
    const result = await setAttendanceStatusOverride(userId, calendarDate, statusOverride);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to save" }, { status: 400 });
  }
}
