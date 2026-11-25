import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { CAMPAIGN_SOFTWARE, normalizeCampaign } from "@/lib/campaigns";
import SoftwareLeadDetailClient from "@/components/SoftwareLeads/SoftwareLeadDetailClient";

export default async function SoftwareLeadPage({ params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");
  const softwareUser =
    authedUser.role === "admin" || normalizeCampaign(authedUser.campaign) === CAMPAIGN_SOFTWARE;
  if (!softwareUser) redirect("/leads");

  const { id: rawId } = await params;
  const leadId = Number(rawId);
  if (!Number.isInteger(leadId) || leadId < 1) redirect("/software-leads");

  return (
    <>
      <div className="mb-6 border-b border-teal-200 pb-5 dark:border-teal-900">
        <Link
          href="/software-leads"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-300"
        >
          ← Back to software leads
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-teal-950 dark:text-teal-100">
          Software lead
        </h1>
      </div>
      <SoftwareLeadDetailClient leadId={leadId} />
    </>
  );
}
