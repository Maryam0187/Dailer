import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import DataRetentionClient from "@/components/DataRetention/DataRetentionClient";

export default async function DataRetentionPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Data retention
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Free MySQL disk by deleting old call logs and user activities. Call reports stay accurate
          via date-wise CallDailyMetrics; attendance stays on AttendanceDailyRecords. Backfill
          call daily metrics, preview counts, confirm, then Optimize to reclaim volume space.
        </p>
      </div>
      <DataRetentionClient />
    </>
  );
}
