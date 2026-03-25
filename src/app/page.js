import { redirect } from "next/navigation";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import CallLogsClient from "@/components/CallLogs/CallLogsClient";
import Navbar from "@/components/Navbar";
import DialerMiniWindow from "@/components/Dialer/DialerMiniWindow";

export default async function Home() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  const role = authedUser.role;

  let agents = [];
  let managers = [];

  if (role === "admin") {
    const [agentRows, managerRows] = await Promise.all([
      db.User.findAll({ where: { role: "agent" }, attributes: ["id", "username"], order: [["username", "ASC"]] }),
      db.User.findAll({ where: { role: "manager" }, attributes: ["id", "username"], order: [["username", "ASC"]] }),
    ]);
    agents = agentRows.map((r) => ({ id: r.id, username: r.username }));
    managers = managerRows.map((r) => ({ id: r.id, username: r.username }));
  } else if (role === "manager") {
    const agentRows = await db.User.findAll({
      where: { role: "agent", managerId: authedUser.id },
      attributes: ["id", "username"],
      order: [["username", "ASC"]],
    });
    agents = agentRows.map((r) => ({ id: r.id, username: r.username }));
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-black">
      <Navbar role={role} />

      <div className="mx-auto max-w-6xl px-4 py-8 lg:pr-[360px]">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
            Call Logs
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Logged in as <span className="font-medium">{authedUser.username}</span> ({role})
          </p>
        </div>

        <CallLogsClient role={role} agents={agents} managers={managers} defaultManagerId={authedUser.id} />
      </div>

      <DialerMiniWindow />
    </div>
  );
}
