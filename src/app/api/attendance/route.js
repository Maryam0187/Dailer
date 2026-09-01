import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  buildLoginAttendanceReport,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";
import { buildTierDeadlines } from "@/server/attendance/lateStatus";
import { getGamificationSnapshot } from "@/server/attendance/processLoginGamification";

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const fromDate = parseAttendanceDateOnly(searchParams.get("fromDate"));
  const toDate = parseAttendanceDateOnly(searchParams.get("toDate"));
  const rawUserId = searchParams.get("userId");
  const requestedUserId = rawUserId ? Number(rawUserId) : null;

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }
  if (!Number.isInteger(requestedUserId) || requestedUserId < 1) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const [report, gamification] = await Promise.all([
      buildLoginAttendanceReport([requestedUserId], fromDate, toDate, {
        includeDays: true,
        includeLogins: false,
      }),
      getGamificationSnapshot(requestedUserId, { fromDate, toDate }),
    ]);

    const userReport = report.users[0];
    if (!userReport) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tierLegend = buildTierDeadlines({
      id: userReport.userId,
      role: userReport.role,
      shiftKey: userReport.shiftKey,
      isOutside: userReport.isOutside,
    });

    return NextResponse.json({
      fromDate,
      toDate,
      userId: requestedUserId,
      username: userReport.username,
      days: userReport.days ?? [],
      summary: userReport.summary ?? null,
      gamification,
      tierLegend,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to load attendance" }, { status: 400 });
  }
}
