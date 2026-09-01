import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { parseAttendanceDateOnly } from "@/server/attendance/buildLoginAttendanceReport";
import { setOfficeFingerprintAt } from "@/server/attendance/setOfficeFingerprintAt";

export async function PATCH(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = Number(body.userId);
  const calendarDate = parseAttendanceDateOnly(body.calendarDate);
  const officeFingerprintAt =
    body.officeFingerprintAt === null || body.officeFingerprintAt === ""
      ? null
      : body.officeFingerprintAt;

  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!calendarDate) {
    return NextResponse.json({ error: "calendarDate is required (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const result = await setOfficeFingerprintAt(userId, calendarDate, officeFingerprintAt);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to save" }, { status: 400 });
  }
}
