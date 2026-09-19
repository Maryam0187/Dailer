import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canTrainAddressBot } from "@/server/auth/canTrainAddressBot";
import AddressBotSettingsClient from "@/components/AddressBot/AddressBotSettingsClient";

export default async function AddressBotSettingsPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.accessMode === "limited" || !canTrainAddressBot(authedUser)) redirect("/");

  const isAdmin = authedUser.role === "admin";

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Address Assistant
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Train the shared address bot: name it, tell it how to speak, and add question-and-answer
          examples. On a live call, Start uses this with the selected company address.
        </p>
      </div>
      <AddressBotSettingsClient isAdmin={isAdmin} />
    </>
  );
}
