import { redirect } from "next/navigation";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessAttendance } from "@/server/auth/userAccess";
import AttendanceClient from "@/components/Attendance/AttendanceClient";

const MANAGER_TEAM_ROLES = ["agent", "supervisor", "processor", "lead_supervisor"];

export default async function AttendancePage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (!canAccessAttendance(authedUser)) redirect("/");

  const isAdmin = authedUser.role === "admin";
  const where = {
    isActive: { [Op.ne]: false },
  };
  if (!isAdmin) {
    where.managerId = authedUser.id;
    where.role = { [Op.in]: MANAGER_TEAM_ROLES };
  }

  const rows = await db.User.findAll({
    where,
    attributes: ["id", "username", "shiftKey", "isOutside"],
    order: [["username", "ASC"]],
  });
  const users = rows.map((row) => ({
    id: row.id,
    username: row.username,
    shiftKey: row.shiftKey === "night" ? "night" : "day",
    isOutside: Boolean(row.isOutside),
  }));

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Attendance
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Daily login activity and desktop vs mobile online time while the dialer stays connected.
          {isAdmin || authedUser.role === "manager"
            ? " Admins and managers can set Absent, Leave, or Half leave for a day."
            : ""}
        </p>
      </div>
      <AttendanceClient isAdmin={isAdmin} canEditStatus users={users} />
    </>
  );
}
