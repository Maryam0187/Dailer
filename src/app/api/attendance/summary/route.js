import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  buildLoginAttendanceReport,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const fromDate = parseAttendanceDateOnly(searchParams.get("fromDate"));
  const toDate = parseAttendanceDateOnly(searchParams.get("toDate"));

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  try {
    const report = await buildLoginAttendanceReport([], fromDate, toDate, {
      includeDays: false,
      allActiveUsers: true,
    });

    const rows = report.users
      .map((row) => ({
        userId: row.userId,
        username: row.username,
        role: row.role,
        shiftKey: row.shiftKey,
        ...row.summary,
      }))
      .sort((a, b) => b.daysZeroPoints - a.daysZeroPoints || a.daysOnTime - b.daysOnTime);

    return NextResponse.json({
      fromDate,
      toDate,
      users: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to load summary" }, { status: 400 });
  }
}
