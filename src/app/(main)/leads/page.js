import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import LeadsClient from "@/components/Leads/LeadsClient";

export default async function LeadsPage({ searchParams }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  const sp = searchParams && typeof searchParams.then === "function" ? await searchParams : searchParams;
  const initialShowForm = sp?.new === "1";

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Leads</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Add leads and place follow-up calls. Lead calls use agent-first dialing for instant connect when
          they answer.
        </p>
      </div>
      <LeadsClient initialShowForm={initialShowForm} userRole={authedUser.role} />
    </>
  );
}
