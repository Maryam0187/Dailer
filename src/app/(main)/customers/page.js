import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import CustomersClient from "@/components/Customers/CustomersClient";

export default async function CustomersPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (authedUser.role !== "admin") redirect("/");
  if (authedUser.accessMode === "limited") redirect("/");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Customers
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Phone-based customers with lead history and saved payment methods. Display name comes from
          the latest lead.
        </p>
      </div>
      <CustomersClient />
    </>
  );
}
