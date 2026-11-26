import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { CAMPAIGN_SOFTWARE, normalizeCampaign } from "@/lib/campaigns";
import SoftwareLeadDetailClient from "@/components/SoftwareLeads/SoftwareLeadDetailClient";

export default async function SoftwareLeadPage({ params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");
  const isAdmin = authedUser.role === "admin";
  const softwareUser = isAdmin || normalizeCampaign(authedUser.campaign) === CAMPAIGN_SOFTWARE;
  if (!softwareUser) redirect("/leads");

  const backHref = isAdmin ? "/leads?campaign=software" : "/software-leads";
  const { id: rawId } = await params;
  const leadId = Number(rawId);
  if (!Number.isInteger(leadId) || leadId < 1) redirect(backHref);

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 dark:border-zinc-800">
        <Link
          href={backHref}
          className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {isAdmin ? "← Back to leads" : "← Back to software leads"}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Software lead
        </h1>
      </div>
      <SoftwareLeadDetailClient leadId={leadId} />
    </>
  );
}
