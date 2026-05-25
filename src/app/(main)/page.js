import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import CallLogsClient from "@/components/CallLogs/CallLogsClient";
import QuickDialPanel from "@/components/Dialer/QuickDialPanel";

export default async function Home({ searchParams }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  const role = authedUser.role;

  const sp = searchParams && typeof searchParams.then === "function" ? await searchParams : searchParams;
  const scopeRaw = typeof sp?.scope === "string" ? sp.scope.trim().toLowerCase() : "";
  const initialLogsScope =
    scopeRaw === "conference" ? "conference" : scopeRaw === "recording" ? "recording" : "all";

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Dialer
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Place outbound calls and review call logs below — use{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">With recording</span> or{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Conference calls</span> in the
          log filters. Signed in as{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{authedUser.username}</span>
          <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
          <span className="capitalize">{role}</span>
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <QuickDialPanel />
        <CallLogsClient initialScope={initialLogsScope} userRole={role} />
      </div>
    </>
  );
}
