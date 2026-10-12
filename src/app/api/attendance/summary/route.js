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
  const rawShift = String(searchParams.get("shiftKey") || "").trim().toLowerCase();
  const shiftKey = rawShift === "day" || rawShift === "night" ? rawShift : null;
  const rawLocation = String(searchParams.get("location") || "all").trim().toLowerCase();
  const locationFilter =
    rawLocation === "outside" || rawLocation === "in_house" ? rawLocation : "all";

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
      locationFilter,
    });

    const rows = report.users
      .map((row) => ({
        userId: row.userId,
        username: row.username,
        role: row.role,
        shiftKey: row.shiftKey === "night" ? "night" : "day",
        isOutside: Boolean(row.isOutside),
        ...row.summary,
      }))
      .filter((row) => !shiftKey || row.shiftKey === shiftKey)
      .sort(
        (a, b) =>
          (Number(b.totalOnlineMs) || 0) - (Number(a.totalOnlineMs) || 0) ||
          (b.daysAbsent ?? 0) - (a.daysAbsent ?? 0),
      );

    return NextResponse.json({
      fromDate,
      toDate,
      shiftKey,
      location: locationFilter,
      users: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to load summary" }, { status: 400 });
  }
}
