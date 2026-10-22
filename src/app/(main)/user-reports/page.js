import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessUserReports } from "@/server/auth/userAccess";
import UserReportsClient from "@/components/UserReports/UserReportsClient";

/** Managers only see their agents' reports (not other managers / admins). */
const MANAGER_AGENT_ROLES = ["agent", "supervisor", "processor", "lead_supervisor"];

export default async function UserReportsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (!canAccessUserReports(authedUser)) redirect("/");

  const isAdmin = authedUser.role === "admin";
  const isManager = authedUser.role === "manager";
  const where = {
    isActive: { [Op.ne]: false },
  };
  if (!isAdmin) {
    where.managerId = authedUser.id;
    where.role = { [Op.in]: MANAGER_AGENT_ROLES };
  }

  const rows = await db.User.findAll({
    where,
    attributes: ["id", "username", "displayName", "shiftKey", "isOutside", "role", "canUseDialer2"],
    order: [["username", "ASC"]],
  });
  const users = rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName || null,
    shiftKey: row.shiftKey === "night" ? "night" : "day",
    isOutside: Boolean(row.isOutside),
    role: row.role,
    canUseDialer2: Boolean(row.canUseDialer2),
  }));

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          User reports
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {isAdmin
            ? "Attendance, call metrics, and per-user timeline, call logs, and leads for any user."
            : "Attendance and reports for your agents — timeline, call logs, online time, and leads."}{" "}
          Today and date presets use US Eastern time; timestamps show both ET and PKT.
        </p>
      </div>
      <Suspense
        fallback={<p className="text-sm text-zinc-600 dark:text-zinc-300">Loading reports…</p>}
      >
        <UserReportsClient
          isAdmin={isAdmin}
          isManager={isManager}
          canEditAttendanceStatus
          users={users}
          viewerRole={authedUser.role}
          currentUserId={authedUser.id}
        />
      </Suspense>
    </>
  );
}
