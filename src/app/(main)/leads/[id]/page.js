import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import LeadPageClient from "@/components/Leads/LeadPageClient";

export default async function LeadPage({ params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");

  const { id: rawId } = await params;
  const leadId = Number(rawId);
  if (!Number.isInteger(leadId) || leadId <= 0) redirect("/leads");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 dark:border-zinc-800">
        <Link
          href="/leads"
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          ← Back to leads
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Lead</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Full-page lead details, activity, and call logs.
        </p>
      </div>
      <LeadPageClient leadId={leadId} userRole={authedUser.role} />
    </>
  );
}
