import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import ProfileClient from "@/components/Profile/ProfileClient";

export default async function ProfilePage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  return (
    <>
      <div className="mb-5 border-b border-zinc-200/80 pb-4 sm:mb-6 sm:pb-5 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Profile
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
          Manage your account, notifications, and personal attendance.
        </p>
      </div>
      <ProfileClient
        userId={authedUser.id}
        username={authedUser.username}
        role={authedUser.role}
        initialDisplayName={authedUser.displayName || null}
      />
    </>
  );
}
