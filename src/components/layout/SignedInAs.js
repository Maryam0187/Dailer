import db from "@/server/db";

/** Load supervisor username for an agent when `supervisorId` is set. */
export async function loadAssignedSupervisorName(user) {
  if (!user || user.role !== "agent") return null;
  const supervisorId = Number(user.supervisorId);
  if (!Number.isInteger(supervisorId) || supervisorId <= 0) return null;

  const supervisor = await db.User.findByPk(supervisorId, {
    attributes: ["id", "username", "role", "isActive"],
  });
  if (!supervisor || supervisor.isActive === false) return null;
  return supervisor.username || null;
}

function roleDisplay(role) {
  return String(role || "").replace(/_/g, " ");
}

/** Bold username · role, plus supervisor for agents when assigned. */
export default function SignedInAs({ username, role, supervisorName = null }) {
  return (
    <>
      Signed in as{" "}
      <span className="font-bold text-zinc-900 dark:text-zinc-100">{username}</span>
      <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
      <span className="font-bold capitalize text-zinc-900 dark:text-zinc-100">
        {roleDisplay(role)}
      </span>
      {supervisorName ? (
        <>
          <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
          Supervisor{" "}
          <span className="font-bold text-zinc-900 dark:text-zinc-100">{supervisorName}</span>
        </>
      ) : null}
    </>
  );
}
