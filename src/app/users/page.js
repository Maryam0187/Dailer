import { redirect } from "next/navigation";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import UsersClient from "@/components/Users/UsersClient";
import Navbar from "@/components/Navbar";
import DialerMiniWindow from "@/components/Dialer/DialerMiniWindow";

export default async function UsersPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin" && authedUser.role !== "manager") redirect("/");

  const [usersRows, managersRows] = await Promise.all([
    authedUser.role === "admin"
      ? db.User.findAll({
          attributes: ["id", "username", "role", "managerId", "createdAt"],
          order: [["createdAt", "DESC"]],
        })
      : db.User.findAll({
          attributes: ["id", "username", "role", "managerId", "createdAt"],
          where: { role: "agent", managerId: authedUser.id },
          order: [["createdAt", "DESC"]],
        }),
    authedUser.role === "admin"
      ? db.User.findAll({
          attributes: ["id", "username"],
          where: { role: "manager" },
          order: [["username", "ASC"]],
        })
      : [],
  ]);

  const users = usersRows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    managerId: r.managerId,
    createdAt: r.createdAt,
  }));

  const managers = managersRows.map((r) => ({ id: r.id, username: r.username }));

  return (
    <div className="min-h-full bg-zinc-50 py-8 dark:bg-black">
      <Navbar role={authedUser.role} />

      <div className="mx-auto max-w-5xl px-4 lg:pr-[360px]">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
            Users
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Logged in as <span className="font-medium">{authedUser.username}</span> ({authedUser.role})
          </p>
        </div>

        <UsersClient role={authedUser.role} managers={managers} initialUsers={users} />
      </div>

      <DialerMiniWindow />
    </div>
  );
}

