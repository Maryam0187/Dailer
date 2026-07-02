import { redirect } from "next/navigation";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { derivePresence } from "@/server/auth/presence";
import { sortUsersForDisplay } from "@/lib/sortUsers";
import UsersClient from "@/components/Users/UsersClient";
import { getLastIpAddressesByUserId } from "@/server/activity/getLastIpAddressesByUserId";

export default async function UsersPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (
    authedUser.role !== "admin" &&
    authedUser.role !== "manager" &&
    authedUser.role !== "supervisor"
  ) {
    redirect("/");
  }

  const listAttributes = [
    "id",
    "username",
    "role",
    "managerId",
    "supervisorId",
    "createdBy",
    "createdAt",
    "isActive",
    "afterShiftAccess",
    "afterShiftLimitedFileId",
    "activeSessionId",
    "activeSessionLastSeenAt",
  ];

  const listInclude = [
    {
      association: "creator",
      attributes: ["id", "username"],
      required: false,
    },
  ];

  let usersWhere;
  if (authedUser.role === "admin") {
    usersWhere = undefined;
  } else if (authedUser.role === "manager") {
    usersWhere = {
      role: { [Op.in]: ["agent", "supervisor"] },
      managerId: authedUser.id,
    };
  } else {
    usersWhere = {
      role: "agent",
      supervisorId: authedUser.id,
    };
  }

  const [usersRows, managersRows] = await Promise.all([
    db.User.findAll({
      attributes: listAttributes,
      include: listInclude,
      ...(usersWhere ? { where: usersWhere } : {}),
      order: [["createdAt", "DESC"]],
    }),
    authedUser.role === "admin"
      ? db.User.findAll({
          attributes: ["id", "username"],
          where: { role: "manager", isActive: true },
          order: [["username", "ASC"]],
        })
      : [],
  ]);

  const nowMs = Date.now();
  const lastIpByUserId =
    authedUser.role === "admin"
      ? await getLastIpAddressesByUserId(usersRows.map((r) => r.id))
      : null;
  const users = usersRows.map((r) => {
    const presence = derivePresence(
      {
        id: r.id,
        activeSessionId: r.activeSessionId,
        activeSessionLastSeenAt: r.activeSessionLastSeenAt,
      },
      nowMs,
    );
    return {
      id: r.id,
      username: r.username,
      role: r.role,
      managerId: r.managerId,
      supervisorId: r.supervisorId,
      createdBy: r.createdBy ?? null,
      createdByUsername: r.creator?.username ?? null,
      createdAt: r.createdAt,
      isActive: !(r.isActive === false || r.isActive === 0),
      ...(authedUser.role === "admin"
        ? {
            afterShiftAccess: r.afterShiftAccess || "none",
            afterShiftLimitedFileId: r.afterShiftLimitedFileId ?? null,
            lastIpAddress: lastIpByUserId?.get(r.id) ?? null,
          }
        : {}),
      presence: presence.status,
      lastActiveAt: presence.lastActiveAt,
    };
  });

  const managers = managersRows.map((r) => ({ id: r.id, username: r.username }));
  const supervisors = users
    .filter((u) => u.role === "supervisor" && u.isActive)
    .map((u) => ({ id: u.id, username: u.username, managerId: u.managerId }));

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
        supervisors={supervisors}
        initialUsers={sortUsersForDisplay(users)}
        currentUserId={authedUser.id}
      />
    </>
  );
}
