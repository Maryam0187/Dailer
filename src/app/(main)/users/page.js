import { redirect } from "next/navigation";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import UsersClient from "@/components/Users/UsersClient";

export default async function UsersPage() {
  const authedUser = await getAuthedUser();
  if (authedUser.role !== "admin" && authedUser.role !== "manager") redirect("/");

  const [usersRows, managersRows] = await Promise.all([
    authedUser.role === "admin"
      ? db.User.findAll({
          attributes: ["id", "username", "role", "managerId", "createdAt", "isActive"],
          order: [["createdAt", "DESC"]],
        })
      : db.User.findAll({
          attributes: ["id", "username", "role", "managerId", "createdAt", "isActive"],
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
    isActive: !(r.isActive === false || r.isActive === 0),
  }));

  const managers = managersRows.map((r) => ({ id: r.id, username: r.username }));

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Users
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Manage team accounts and permissions. Signed in as{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            {authedUser.username}
          </span>
          <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
          <span className="capitalize">{authedUser.role}</span>
        </p>
      </div>

      <UsersClient
        role={authedUser.role}
        managers={managers}
        initialUsers={users}
        currentUserId={authedUser.id}
      />
    </>
  );
}
