import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { CAMPAIGN_SOFTWARE, normalizeCampaign } from "@/lib/campaigns";
import SoftwareLeadsClient from "@/components/SoftwareLeads/SoftwareLeadsClient";

export default async function SoftwareLeadsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");
  const softwareUser =
    authedUser.role === "admin" || normalizeCampaign(authedUser.campaign) === CAMPAIGN_SOFTWARE;
  if (!softwareUser) redirect("/leads");

  return (
    <>
      <div className="mb-8 border-b border-teal-200 pb-6 dark:border-teal-900">
        <h1 className="text-3xl font-semibold tracking-tight text-teal-950 dark:text-teal-100">
          Software leads
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-teal-800/80 dark:text-teal-200/80">
          Software telemarketing leads. Appointments, files, and profile stay on the same screens as the TV campaign.
        </p>
      </div>
      <SoftwareLeadsClient />
    </>
  );
}
