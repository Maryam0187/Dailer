import { getAuthedUser } from "@/server/auth/getAuthedUser";
import CallLogsClient from "@/components/CallLogs/CallLogsClient";
import QuickDialPanel from "@/components/Dialer/QuickDialPanel";

export default async function Home() {
  const authedUser = await getAuthedUser();
  const role = authedUser.role;

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Call logs
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Place outbound calls and review history. Signed in as{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{authedUser.username}</span>
          <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
          <span className="capitalize">{role}</span>
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <QuickDialPanel />
        <CallLogsClient />
      </div>
    </>
  );
}
