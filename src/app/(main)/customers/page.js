import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessCustomers, isOutsideManager } from "@/server/customers/customerAccess";
import CustomersClient from "@/components/Customers/CustomersClient";

export default async function CustomersPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  if (!canAccessCustomers(authedUser)) redirect("/");
  if (authedUser.accessMode === "limited") redirect("/");

  const managerOnly = isOutsideManager(authedUser);

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Customers
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {managerOnly
            ? "Customers assigned to you — payment methods and charges."
            : "Lead customers with payment methods, plus a separate Outside tab for billed accounts. The same phone can appear on both tabs."}
        </p>
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading customers…</p>
        }
      >
        <CustomersClient
          isAdmin={authedUser.role === "admin"}
          managerOnly={managerOnly}
          viewerId={authedUser.id}
          viewerUsername={authedUser.username}
        />
      </Suspense>
    </>
  );
}
