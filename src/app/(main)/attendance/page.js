import { redirect } from "next/navigation";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import AttendanceClient from "@/components/Attendance/AttendanceClient";

export default async function AttendancePage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");

  const rows = await db.User.findAll({
    where: {
      isActive: { [Op.ne]: false },
      isOutside: { [Op.ne]: true },
    },
    attributes: ["id", "username", "shiftKey"],
    order: [["username", "ASC"]],
  });
  const users = rows.map((row) => ({
    id: row.id,
    username: row.username,
    shiftKey: row.shiftKey === "night" ? "night" : "day",
  }));

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Attendance & rewards
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Earn points for signing in on time. Full points within 30 minutes of shift start — partial
          credit for later logins. Keep your streak with 100% or 90% tiers.
        </p>
      </div>
      <AttendanceClient isAdmin users={users} />
    </>
  );
}
