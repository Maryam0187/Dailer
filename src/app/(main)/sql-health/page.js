import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import SqlHealthClient from "@/components/SqlHealth/SqlHealthClient";

export default async function SqlHealthPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          SQL health
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Live MySQL status for this database: connections, scan ratio, buffer pool, table sizes, and
          optimization hints. Read-only — no queries are changed from this page.
        </p>
      </div>
      <SqlHealthClient />
    </>
  );
}
