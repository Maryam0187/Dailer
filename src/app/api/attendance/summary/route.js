import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessAttendance } from "@/server/auth/userAccess";
import {
  buildLoginAttendanceReport,
  parseAttendanceDateOnly,
} from "@/server/attendance/buildLoginAttendanceReport";

const MANAGER_TEAM_ROLES = ["agent", "supervisor", "processor", "lead_supervisor"];

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAttendance(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    const isAdmin = authedUser.role === "admin";
    let userIds = [];
    let allActiveUsers = false;

    if (isAdmin) {
      allActiveUsers = true;
    } else {
      const team = await db.User.findAll({
        where: {
          isActive: { [Op.ne]: false },
          managerId: authedUser.id,
          role: { [Op.in]: MANAGER_TEAM_ROLES },
        },
        attributes: ["id"],
      });
      userIds = team.map((u) => u.id);
      if (userIds.length === 0) {
        return NextResponse.json({
          fromDate,
          toDate,
          shiftKey,
          location: locationFilter,
          users: [],
        });
      }
    }

    const report = await buildLoginAttendanceReport(userIds, fromDate, toDate, {
      includeDays: false,
      allActiveUsers,
      locationFilter: isAdmin ? locationFilter : "all",
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
          (Number(b.totalDesktopOnlineMs) || 0) - (Number(a.totalDesktopOnlineMs) || 0) ||
          (Number(b.totalMobileOnlineMs) || 0) - (Number(a.totalMobileOnlineMs) || 0) ||
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
