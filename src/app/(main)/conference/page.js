import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import CallLogsClient from "@/components/CallLogs/CallLogsClient";

export default async function ConferenceCallLogsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  return (
    <>
      <div className="mb-8 border-b border-indigo-200/70 pb-6 dark:border-indigo-900/45">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Conference call logs
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Calls where at least one other agent was invited via{" "}
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Add agent</span> during an active call
          (owner plus invited agents). Use date filters to narrow the list.{" "}
          <Link
            href="/"
            className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
          >
            Back to dialer
          </Link>
        </p>
      </div>

      <div className="rounded-2xl ring-2 ring-indigo-400/25 dark:ring-indigo-500/20">
        <CallLogsClient initialScope="conference" />
      </div>
    </>
  );
}
