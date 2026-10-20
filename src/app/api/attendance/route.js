import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  assertCanManageTarget,
  canAccessAttendance,
} from "@/server/auth/userAccess";
import {
  buildLoginAttendanceReport,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";
import { buildTierDeadlines } from "@/server/attendance/lateStatus";
import { getGamificationSnapshot } from "@/server/attendance/processLoginGamification";
import {
  ensureCompanyLeaveDatesLoaded,
  listCompanyLeaveDatesInRange,
} from "@/server/leave/companyLeaveDates";

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromDate = parseAttendanceDateOnly(searchParams.get("fromDate"));
  const toDate = parseAttendanceDateOnly(searchParams.get("toDate"));
  const rawUserId = searchParams.get("userId");
  const requestedUserId = rawUserId ? Number(rawUserId) : null;
  const isAdmin = authedUser.role === "admin";

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  let targetUserId;
  if (requestedUserId == null) {
    targetUserId = authedUser.id;
  } else if (!Number.isInteger(requestedUserId) || requestedUserId < 1) {
    return NextResponse.json({ error: "userId is invalid" }, { status: 400 });
  } else if (requestedUserId === authedUser.id) {
    targetUserId = authedUser.id;
  } else if (isAdmin) {
    targetUserId = requestedUserId;
  } else {
    if (!canAccessAttendance(authedUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const target = await db.User.findByPk(requestedUserId, {
      attributes: ["id", "role", "managerId", "supervisorId", "isOutside", "shiftKey", "isActive"],
    });
    if (!target || target.isActive === false) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!assertCanManageTarget(authedUser, target)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUserId = requestedUserId;
  }

  try {
    const [report, gamification] = await Promise.all([
      buildLoginAttendanceReport([targetUserId], fromDate, toDate, {
        includeDays: true,
        includeLogins: false,
      }),
      getGamificationSnapshot(targetUserId, { fromDate, toDate }),
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

    try {
      await ensureCompanyLeaveDatesLoaded();
    } catch {
      /* non-fatal */
    }
    const companyLeaveDates = listCompanyLeaveDatesInRange(fromDate, toDate);

    return NextResponse.json({
      fromDate,
      toDate,
      userId: targetUserId,
      username: userReport.username,
      days: userReport.days ?? [],
      summary: userReport.summary ?? null,
      companyLeaveDates,
      gamification,
      tierLegend,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to load attendance" }, { status: 400 });
  }
}
