import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { CAMPAIGN_SOFTWARE, normalizeCampaign } from "@/lib/campaigns";
import SoftwareLeadsClient from "@/components/SoftwareLeads/SoftwareLeadsClient";

export default async function SoftwareLeadsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited") redirect("/");
  if (authedUser.role === "admin") redirect("/leads?campaign=software");
  if (normalizeCampaign(authedUser.campaign) !== CAMPAIGN_SOFTWARE) redirect("/leads");

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Software leads
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Software telemarketing leads. Appointments, files, and profile stay on the same screens as the TV campaign.
        </p>
      </div>
      <SoftwareLeadsClient />
    </>
  );
}
