import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import SecurityClient from "@/components/Security/SecurityClient";

export default async function SecurityPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Security
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Optionally protect your admin account with Google Authenticator. When enabled, sign-in
          requires your password and a 6-digit code from the app.
        </p>
      </div>
      <SecurityClient />
    </>
  );
}
